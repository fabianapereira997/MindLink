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
        ${el('DataNascimento', formatDate(user.data_nascimento))}
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

/**
 * Traduz uma mensagem de erro técnica de validação XSD (libxml2) numa
 * mensagem simples e percetível para o utilizador final, com indicação de
 * como resolver o problema.
 */
export function friendlyXmlValidationError(message: string): string {
  // Nomes legíveis para os campos mais comuns dos XML exportados.
  const fieldLabels: Record<string, string> = {
    Email: 'email',
    GeradoEm: 'data de geração',
    Id: 'identificador',
    Nome: 'nome',
    Doenca: 'doença',
    DataNascimento: 'data de nascimento',
    Data: 'data',
    DataInicio: 'data de início',
    DataFim: 'data de fim',
    Genero: 'género',
  };
  const labelFor = (field: string) => fieldLabels[field] ?? `campo "${field}"`;

  // 1) Campo com formato/padrão inválido (ex.: Email fora do formato xxxx@xxxx.xxx).
  const patternMatch = message.match(/Element '([^']+)':.*?\[facet '[^']+'\] The value '([^']*)' is not accepted/);
  if (patternMatch) {
    const [, field, value] = patternMatch;
    return `O ${labelFor(field)} "${value}" não está num formato válido. Verifique se segue o formato correto (ex.: para o email, "nome@dominio.com") e tente novamente.`;
  }

  // 2) Valor que não corresponde ao tipo de dados esperado (data, data/hora, número, booleano).
  const typeMatch = message.match(/Element '([^']+)':\s*'([^']*)' is not a valid value of the atomic type '([^']+)'/);
  if (typeMatch) {
    const [, field, value, type] = typeMatch;
    const label = labelFor(field);

    if (type === 'xs:date') {
      return `O ${label} "${value}" tem um formato de data inválido. Use o formato AAAA-MM-DD (ex.: 2000-05-31).`;
    }
    if (type === 'xs:dateTime') {
      return `O ${label} "${value}" tem um formato de data/hora inválido. Use o formato AAAA-MM-DDTHH:MM:SS (ex.: 2024-06-13T10:30:00).`;
    }
    if (type === 'xs:boolean') {
      return `O ${label} "${value}" deve ser "true" ou "false".`;
    }
    if (/integer/i.test(type)) {
      return `O ${label} "${value}" deve ser um número inteiro válido.`;
    }
    return `O ${label} "${value}" não tem um valor válido para este campo.`;
  }

  // 3) Falta um elemento obrigatório.
  const missingMatch = message.match(/Element '([^']+)':\s*Missing child element\(s\)\. Expected is(?: one of)? (.+?)\.?$/);
  if (missingMatch) {
    const [, parent, expected] = missingMatch;
    const expectedNames = expected.match(/'([^']+)'/g)?.map(s => s.replace(/'/g, '')).join(', ');
    return `Falta(m) campo(s) obrigatório(s) dentro de "${parent}"${expectedNames ? ` (esperado: ${expectedNames})` : ''}. Verifique se o ficheiro foi exportado corretamente e não foi editado manualmente.`;
  }

  // 4) Elemento inesperado / fora de ordem.
  const unexpectedMatch = message.match(/Element '([^']+)':\s*This element is not expected\.(?: Expected is(?: one of)? (.+?)\.?)?$/);
  if (unexpectedMatch) {
    const [, field, expected] = unexpectedMatch;
    const expectedNames = expected?.match(/'([^']+)'/g)?.map(s => s.replace(/'/g, '')).join(', ');
    return `O elemento "${field}" não era esperado nesta posição do ficheiro${expectedNames ? ` (esperava-se: ${expectedNames})` : ''}. Verifique se o ficheiro não foi alterado e se corresponde ao tipo de exportação correto.`;
  }

  // 5) Ficheiro de outro tipo de exportação/estrutura não reconhecida.
  if (/No matching global declaration available for the validation root|Did not expect element/i.test(message)) {
    return 'Este ficheiro não corresponde ao tipo de exportação esperado. Confirme que selecionou o ficheiro XML correto, exportado a partir desta funcionalidade.';
  }

  // 6) Conteúdo de texto onde não é permitido.
  if (/Character content other than whitespace is not allowed/i.test(message)) {
    return 'O ficheiro contém texto num local onde não é permitido. Verifique se o ficheiro não foi editado manualmente e tente exportá-lo novamente.';
  }

  // 7) XML mal formado / corrompido / vazio.
  if (/parser error|not well-formed|Premature end|Document is empty|Start tag expected/i.test(message)) {
    return 'O ficheiro não é um XML válido (está corrompido, vazio ou mal formado). Tente exportá-lo novamente a partir da plataforma.';
  }

  // Fallback genérico.
  return 'O ficheiro XML não é válido. Verifique se foi exportado corretamente a partir da plataforma e não foi alterado manualmente.';
}
