import path from 'path';
import fs from 'fs';

/**
 * Escapa caracteres especiais para que o texto possa ser inserido em
 * conteúdo de elemento XML em segurança (&, <, >, ", ').
 */
export function escapeXml(value: unknown): string {
  if (value === null || value === undefined) return '';
  return String(value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

/** Devolve um elemento XML simples: <Tag>valor</Tag>, ou auto-fechado se vazio/omitido. */
function el(tag: string, value: unknown, opts: { selfCloseIfEmpty?: boolean } = {}): string {
  if (value === null || value === undefined || value === '') {
    if (opts.selfCloseIfEmpty) return `<${tag}/>`;
    return `<${tag}></${tag}>`;
  }
  return `<${tag}>${escapeXml(value)}</${tag}>`;
}

/** Elemento booleano nillable: <Tag>true|false</Tag> ou <Tag xsi:nil="true"/> se null/undefined. */
function elNillableBool(tag: string, value: boolean | null | undefined): string {
  if (value === null || value === undefined) return `<${tag} xsi:nil="true"/>`;
  return `<${tag}>${value ? 'true' : 'false'}</${tag}>`;
}

/** Formata uma data (Date ou string) como 'yyyy-MM-dd'. */
export function formatDate(value: unknown): string {
  if (!value) return '';
  const d = new Date(value as string);
  if (isNaN(d.getTime())) return '';
  return d.toISOString().slice(0, 10);
}

/** Formata uma data (Date ou string) como dateTime ISO 8601. */
export function formatDateTime(value: unknown): string {
  if (!value) return '';
  const d = new Date(value as string);
  if (isNaN(d.getTime())) return '';
  return d.toISOString();
}

// ─────────────────────────────────────────────────────────────────────────────
// Export individual de paciente (perfil + formulário + registos de humor +
// desafios + consultas)
// ─────────────────────────────────────────────────────────────────────────────

export function buildPacienteCompletoXml(
  paciente: any,
  questionarios: any[],
  desafios: any[],
  consultas: any[],
): string {
  const user = paciente.user ?? {};
  const psicologo = paciente.psicologo ?? {};
  const psicologoUser = psicologo.user ?? {};
  const formulario = paciente.formulario ?? {};
  const historicoMedico = formulario.historicoMedico ?? {};
  const estiloDeVida = formulario.estiloDeVida ?? {};
  const comorbilidades: string[] = Array.isArray(historicoMedico.comorbilidades)
    ? historicoMedico.comorbilidades
    : [];

  const registosHumorXml = questionarios
    .map((q) => `      <RegistoHumor>
        ${el('Id', q._id)}
        ${el('Data', formatDateTime(q.data))}
        ${el('Humor', q.humor)}
        <Sintomas>
${(Array.isArray(q.sintomas) ? q.sintomas : []).map((s: string) => `          ${el('Sintoma', s)}`).join('\n')}
        </Sintomas>
        ${el('Notas', q.notas, { selfCloseIfEmpty: true })}
      </RegistoHumor>`)
    .join('\n');

  const desafiosXml = desafios
    .map((d) => `      <Desafio>
        ${el('Id', d._id)}
        ${el('Titulo', d.titulo)}
        ${el('Descricao', d.descricao)}
        ${el('Tipo', d.tipo)}
        ${el('DataInicio', formatDate(d.data_inicio))}
        ${el('DataFim', formatDate(d.data_fim))}
        ${el('Estado', d.estado)}
        ${el('Sugestao', d.sugestao, { selfCloseIfEmpty: true })}
        ${el('RespostaObrigatoria', d.respostaObrigatoria ? 'true' : 'false', { selfCloseIfEmpty: false })}
        ${el('Resposta', d.resposta, { selfCloseIfEmpty: true })}
        ${el('Comentario', d.comentario, { selfCloseIfEmpty: true })}
      </Desafio>`)
    .join('\n');

  const consultasXml = consultas
    .map((c) => `      <Consulta>
        ${el('Id', c._id)}
        ${el('Data', formatDateTime(c.data))}
        ${el('DuracaoMinutos', c.duracao)}
        ${el('Estado', c.estado)}
        ${el('Notas', c.notas, { selfCloseIfEmpty: true })}
      </Consulta>`)
    .join('\n');

  return `<?xml version="1.0" encoding="UTF-8"?>
<PacienteExport xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance">
  ${el('GeradoEm', formatDateTime(new Date()))}
  <Paciente>
    ${el('Id', paciente._id)}
    ${el('Nome', user.nome)}
    ${el('Email', user.email)}
    ${el('Genero', user.genero)}
    ${el('DataNascimento', formatDate(user.data_nascimento))}
    ${el('Doenca', paciente.doenca)}
    <Formulario>
      <HistoricoMedico>
${comorbilidades.map((c) => `        ${el('Comorbilidade', c)}`).join('\n')}
      </HistoricoMedico>
      <EstiloDeVida>
        ${elNillableBool('ExercicioRegular', estiloDeVida.exercicioRegular ?? null)}
        ${elNillableBool('Fumador', estiloDeVida.fumador ?? null)}
      </EstiloDeVida>
    </Formulario>
    <Psicologo>
      ${el('Id', psicologo._id)}
      ${el('Nome', psicologoUser.nome)}
      ${el('Especialidade', psicologo.especialidade)}
    </Psicologo>
  </Paciente>
  <RegistosHumor>
${registosHumorXml}
  </RegistosHumor>
  <Desafios>
${desafiosXml}
  </Desafios>
  <Consultas>
${consultasXml}
  </Consultas>
</PacienteExport>
`;
}

// ─────────────────────────────────────────────────────────────────────────────
// Export da lista de pacientes de um psicólogo (resumo)
// ─────────────────────────────────────────────────────────────────────────────

export function buildPacientesListaXml(psicologo: any, pacientes: any[]): string {
  const psicologoUser = psicologo.user ?? {};

  const pacientesXml = pacientes
    .map((p) => {
      const user = p.user ?? {};
      return `      <Paciente>
        ${el('Id', p._id)}
        ${el('Nome', user.nome)}
        ${el('Email', user.email)}
        ${el('Doenca', p.doenca)}
      </Paciente>`;
    })
    .join('\n');

  return `<?xml version="1.0" encoding="UTF-8"?>
<PacientesExport>
  ${el('GeradoEm', formatDateTime(new Date()))}
  <Psicologo>
    ${el('Id', psicologo._id)}
    ${el('Nome', psicologoUser.nome)}
    ${el('Especialidade', psicologo.especialidade)}
  </Psicologo>
  <Pacientes>
${pacientesXml}
  </Pacientes>
</PacientesExport>
`;
}

// ─────────────────────────────────────────────────────────────────────────────
// Validação contra XSD (libxml2-wasm é ESM-only, por isso usamos import() dinâmico
// a partir deste módulo CommonJS)
// ─────────────────────────────────────────────────────────────────────────────

const xsdDir = path.join(__dirname, '..', 'xsd');

// libxml2-wasm é um pacote ESM-only ('"main": "lib/index.mjs"'). O TypeScript,
// ao compilar para CommonJS, transformaria `import()` num `require()`, o que
// falha com ERR_REQUIRE_ASYNC_MODULE para módulos ESM com top-level await.
// Usamos `new Function(...)` para gerar um `import()` dinâmico "real" que o
// compilador não reescreve.
const dynamicImport: (specifier: string) => Promise<any> = new Function(
  'specifier',
  'return import(specifier)',
) as (specifier: string) => Promise<any>;

/**
 * Valida uma string XML contra um ficheiro XSD em src/xsd/.
 * Lança um erro com uma mensagem descritiva se o XML for inválido.
 */
export async function validateXmlAgainstXsd(xml: string, xsdFileName: string): Promise<void> {
  const { XmlDocument, XsdValidator } = await dynamicImport('libxml2-wasm');

  const xsdContent = fs.readFileSync(path.join(xsdDir, xsdFileName), 'utf-8');

  const xsdDoc = XmlDocument.fromString(xsdContent);
  const xmlDoc = XmlDocument.fromString(xml);

  let validator;
  try {
    validator = XsdValidator.fromDoc(xsdDoc);
    try {
      validator.validate(xmlDoc);
    } finally {
      validator.dispose();
    }
  } finally {
    xmlDoc.dispose();
    xsdDoc.dispose();
  }
}
