/**
 * Perguntas adicionais do registo diário de humor.
 * Cada pergunta é respondida numa escala de 5 pontos, com rótulos
 * customizáveis por pergunta (consoante o tipo de escala).
 */

export interface PerguntaExtra {
  id: string;
  texto: string;
  escala: [string, string, string, string, string];
}

/** Escala de frequência (últimos 7 dias) */
const FREQUENCIA: [string, string, string, string, string] =
  ['Nunca', 'Raramente', 'Por vezes', 'Frequentemente', 'Quase sempre'];

/** Escala de intensidade */
const INTENSIDADE: [string, string, string, string, string] =
  ['Nada', 'Pouco', 'Moderadamente', 'Muito', 'Extremamente'];

/** Escala de concordância */
const CONCORDANCIA: [string, string, string, string, string] =
  ['Discordo totalmente', 'Discordo', 'Neutro', 'Concordo', 'Concordo totalmente'];

export const QUESTIONARIO_GRUPOS: { titulo: string; perguntas: PerguntaExtra[] }[] = [
  {
    titulo: 'Humor e motivação',
    perguntas: [
      { id: 'q1', texto: 'Tive interesse em fazer coisas', escala: FREQUENCIA },
      { id: 'q2', texto: 'Senti desânimo, desalento ou falta de esperança', escala: FREQUENCIA },
      { id: 'q5', texto: 'Senti que não gosto de mim próprio', escala: FREQUENCIA },
      { id: 'q6', texto: 'Senti que me desiludi a mim ou à minha família', escala: FREQUENCIA },
    ],
  },
  {
    titulo: 'Sono e apetite',
    perguntas: [
      { id: 'q3', texto: 'Tive dificuldades em adormecer ou dormir sem interrupções', escala: FREQUENCIA },
      { id: 'q4', texto: 'Tive falta ou excesso de apetite', escala: FREQUENCIA },
    ],
  },
  {
    titulo: 'Ansiedade e tensão',
    perguntas: [
      { id: 'q7', texto: 'Senti-me nervoso/a, ansioso/a ou irritado/a', escala: FREQUENCIA },
      { id: 'q8', texto: 'Fui incapaz de parar de me preocupar ou controlar as preocupações', escala: FREQUENCIA },
      { id: 'q9', texto: 'Tive dificuldade em relaxar', escala: FREQUENCIA },
    ],
  },
  {
    titulo: 'Sintomas físicos',
    perguntas: [
      { id: 'q10', texto: 'Senti palpitações e/ou batimento cardíaco acelerado', escala: FREQUENCIA },
      { id: 'q11', texto: 'Senti aperto no peito', escala: FREQUENCIA },
    ],
  },
  {
    titulo: 'Social e pensamentos',
    perguntas: [
      { id: 'q12', texto: 'Sofri por antecipação por ir a um evento social', escala: INTENSIDADE },
      { id: 'q13', texto: 'Sinto constantemente que estou a ser observado e/ou julgado por outras pessoas', escala: CONCORDANCIA },
      { id: 'q14', texto: 'Tive pensamentos obsessivos', escala: FREQUENCIA },
    ],
  },
];

/** Lista plana de todas as perguntas, útil para lookups por id. */
export const QUESTIONARIO_PERGUNTAS: PerguntaExtra[] =
  QUESTIONARIO_GRUPOS.flatMap(g => g.perguntas);

export function getPerguntaTexto(id: string): string {
  return QUESTIONARIO_PERGUNTAS.find(p => p.id === id)?.texto ?? id;
}

export function getEscalaLabel(id: string, valor: number): string {
  const p = QUESTIONARIO_PERGUNTAS.find(p => p.id === id);
  if (!p) return String(valor);
  return p.escala[valor - 1] ?? String(valor);
}
