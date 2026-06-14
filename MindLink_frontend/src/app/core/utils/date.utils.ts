/**
 * Returns today's date as a 'YYYY-MM-DD' string (local time), suitable for
 * binding to the `min`/`max` attributes of `<input type="date">`.
 */
export function todayDateString(): string {
  const now = new Date();
  const year  = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, '0');
  const day   = String(now.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

/**
 * Returns the date exactly `years` years ago from today as a 'YYYY-MM-DD'
 * string (local time), suitable for binding to the `min` attribute of
 * `<input type="date">` for birth dates (default: 120 years, the maximum
 * allowed age).
 */
export function minBirthDateString(years = 120): string {
  const d = new Date();
  d.setFullYear(d.getFullYear() - years);
  const year  = d.getFullYear();
  const month = String(d.getMonth() + 1).padStart(2, '0');
  const day   = String(d.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

/**
 * Calcula a idade (em anos completos) a partir de uma data de nascimento.
 */
export function calcularIdade(dataNascimento: string | Date): number {
  const nascimento = new Date(dataNascimento);
  const hoje = new Date();
  let idade = hoje.getFullYear() - nascimento.getFullYear();
  const aindaNaoFezAnos =
    hoje.getMonth() < nascimento.getMonth() ||
    (hoje.getMonth() === nascimento.getMonth() && hoje.getDate() < nascimento.getDate());
  if (aindaNaoFezAnos) idade--;
  return idade;
}

/**
 * Formata uma data como "mês de ano" em português, por exemplo "junho de 2026".
 */
export function formatarMesAno(data: string | Date): string {
  return new Date(data).toLocaleDateString('pt-PT', { month: 'long', year: 'numeric' });
}
