// Страница звонка из Telegram (call.html). Отдельный файл — чтобы строгая политика CSP не разрешала встроенные скрипты.
// Звонить можно только на номера магазина — страницу нельзя использовать для чужих номеров.
var PHONES = { '+79164050444': '+7 916 405-04-44', '+79252010234': '+7 925 201-02-34' };
var to = new URLSearchParams(location.search).get('to') || '';
var label = PHONES[to];
var link = document.getElementById('call');
if (label) {
  link.href = 'tel:' + to;
  link.textContent = 'Позвонить ' + label;
  location.href = 'tel:' + to;
} else {
  document.getElementById('hint').textContent = 'Номер не найден';
  link.style.display = 'none';
}
