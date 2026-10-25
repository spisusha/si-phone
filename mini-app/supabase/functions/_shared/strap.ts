// Размеры ремешков Apple Watch — выбирает покупатель при заказе (на цену не влияют).
// Общий для витрины и сервера заказа: сервер принимает только размер, который бывает у этого ремешка.
// Обхват запястья — примерно, по таблицам размеров Apple; точнее подскажет менеджер.

export interface StrapSize { size: string; wrist: string }

export function strapSizes(band: string | null | undefined): StrapSize[] {
  const b = (band ?? '').toLowerCase();
  if (/ocean band|sport loop/.test(b)) return [];                       // один размер — выбирать нечего
  if (/alpine loop/.test(b)) return [
    { size: 'S', wrist: '130–160 мм' }, { size: 'M', wrist: '145–190 мм' }, { size: 'L', wrist: '165–210 мм' },
  ];
  if (/titanium milanese loop/.test(b)) return [
    { size: 'S', wrist: '130–180 мм' }, { size: 'M', wrist: '150–200 мм' }, { size: 'L', wrist: '165–210 мм' },
  ];
  if (/trail loop/.test(b)) return [{ size: 'S/M', wrist: '130–180 мм' }, { size: 'M/L', wrist: '165–210 мм' }];
  if (/sport band|milanese loop/.test(b)) return [{ size: 'S/M', wrist: '130–190 мм' }, { size: 'M/L', wrist: '150–210 мм' }];
  return [];
}
