<?php
// Приём заявок с сайта (квиз и «Заказать звонок») и отправка на почту.
declare(strict_types=1);

const MAIL_TO   = 'zayavka@korda.spb.ru';
const MAIL_FROM = 'noreply@vishivka-v-spb.ru'; // ящик должен существовать на хостинге, иначе письма уйдут в спам
const MAX_FILE  = 10 * 1024 * 1024;
const FILE_EXT  = ['jpg', 'jpeg', 'png', 'webp', 'pdf', 'svg', 'ai', 'eps', 'cdr'];

date_default_timezone_set('Europe/Moscow');
header('Content-Type: application/json; charset=utf-8');

function reply(int $code, array $data): never
{
    http_response_code($code);
    echo json_encode($data, JSON_UNESCAPED_UNICODE);
    exit;
}

function field(string $name, int $max): string
{
    $v = trim((string)($_POST[$name] ?? ''));
    $v = preg_replace('/[\x00-\x08\x0B\x0C\x0E-\x1F\x7F]/u', '', $v) ?? '';
    return mb_substr($v, 0, $max);
}

if ($_SERVER['REQUEST_METHOD'] !== 'POST') {
    reply(405, ['ok' => false, 'error' => 'Метод не поддерживается.']);
}

// ловушка для ботов: поле скрыто от людей
if (field('website', 100) !== '') {
    reply(200, ['ok' => true]);
}

// не чаще одной заявки в 20 секунд с одного IP
$lock = sys_get_temp_dir() . '/vyshivka_' . md5($_SERVER['REMOTE_ADDR'] ?? '') . '.lock';
if (is_file($lock) && time() - filemtime($lock) < 20) {
    reply(429, ['ok' => false, 'error' => 'Заявка уже отправлена. Подождите немного перед повторной отправкой.']);
}

$type    = field('type', 20) === 'quiz' ? 'quiz' : 'callback';
$name    = field('name', 100);
$contact = field('contact', 150);

if ($contact === '') {
    reply(422, ['ok' => false, 'error' => 'Укажите, как с вами связаться.']);
}
if (empty($_POST['agree'])) {
    reply(422, ['ok' => false, 'error' => 'Отметьте согласие на обработку данных.']);
}

$rows = ['Имя' => $name ?: '—'];
if ($type === 'quiz') {
    $subject = 'Заявка на расчёт вышивки';
    $rows += [
        'Что вышиваем' => field('what', 100),
        'Тираж'        => field('qty', 50),
        'Макет'        => field('layout', 100),
        'Куда ответить' => field('channel', 20),
    ];
} else {
    $subject = 'Заказ обратного звонка';
}
$rows['Контакт'] = $contact;

$text = '';
foreach ($rows as $k => $v) {
    $text .= "$k: $v\n";
}
$text .= "\nОтправлено с vishivka-v-spb.ru " . date('d.m.Y H:i');

// вложение
$file = $_FILES['file'] ?? null;
$attach = null;
if ($type === 'quiz' && $file && $file['error'] !== UPLOAD_ERR_NO_FILE) {
    if ($file['error'] !== UPLOAD_ERR_OK || $file['size'] > MAX_FILE) {
        reply(422, ['ok' => false, 'error' => 'Файл не загрузился или больше 10 МБ. Отправьте заявку без файла, а макет пришлите на ' . MAIL_TO . '.']);
    }
    $ext = strtolower(pathinfo($file['name'], PATHINFO_EXTENSION));
    if (!in_array($ext, FILE_EXT, true) || !is_uploaded_file($file['tmp_name'])) {
        reply(422, ['ok' => false, 'error' => 'Этот тип файла не подходит. Можно JPG, PNG, PDF, SVG, AI, EPS или CDR.']);
    }
    $attach = ['name' => 'maket.' . $ext, 'data' => file_get_contents($file['tmp_name'])];
}

$headers = [
    'From: =?UTF-8?B?' . base64_encode('Сайт Венерди') . '?= <' . MAIL_FROM . '>',
    'MIME-Version: 1.0',
];
$replyTo = filter_var($contact, FILTER_VALIDATE_EMAIL);
if ($replyTo) {
    $headers[] = 'Reply-To: ' . $replyTo;
}

if ($attach) {
    $b = 'b_' . bin2hex(random_bytes(12));
    $headers[] = "Content-Type: multipart/mixed; boundary=\"$b\"";
    $body = "--$b\r\nContent-Type: text/plain; charset=UTF-8\r\nContent-Transfer-Encoding: base64\r\n\r\n"
        . chunk_split(base64_encode($text))
        . "--$b\r\nContent-Type: application/octet-stream; name=\"{$attach['name']}\"\r\n"
        . "Content-Transfer-Encoding: base64\r\nContent-Disposition: attachment; filename=\"{$attach['name']}\"\r\n\r\n"
        . chunk_split(base64_encode($attach['data']))
        . "--$b--";
} else {
    $headers[] = 'Content-Type: text/plain; charset=UTF-8';
    $headers[] = 'Content-Transfer-Encoding: base64';
    $body = chunk_split(base64_encode($text));
}

$ok = mail(MAIL_TO, '=?UTF-8?B?' . base64_encode($subject) . '?=', $body, implode("\r\n", $headers), '-f' . MAIL_FROM);
if (!$ok) {
    reply(500, ['ok' => false, 'error' => 'Почтовый сервер не принял заявку. Позвоните нам: 8 800 555-91-55.']);
}

touch($lock);
reply(200, ['ok' => true]);
