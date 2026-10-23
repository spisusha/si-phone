// «1 модель», «3 модели», «5 моделей»
export function plural(n: number, forms: [string, string, string]): string {
  const m10 = n % 10;
  const m100 = n % 100;
  const form = m10 === 1 && m100 !== 11 ? forms[0]
    : m10 >= 2 && m10 <= 4 && (m100 < 12 || m100 > 14) ? forms[1]
    : forms[2];
  return `${n} ${form}`;
}
