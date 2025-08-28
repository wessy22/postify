<?php
// מחיקת קובץ תמונה/וידאו מהשרת
if (!isset($_POST['path'])) {
    http_response_code(400);
    echo json_encode(["success" => false, "error" => "No file path provided."]);
    exit;
}
$path = $_POST['path'];
// חילוץ uploads/xxx מהנתיב (גם אם זה URL מלא)
$uploadsPos = strpos($path, 'uploads/');
if ($uploadsPos === false) {
    http_response_code(403);
    echo json_encode(["success" => false, "error" => "Invalid file path."]);
    exit;
}
$relativePath = substr($path, $uploadsPos);
// הגנה: לא לאפשר ../
if (strpos($relativePath, '..') !== false) {
    http_response_code(403);
    echo json_encode(["success" => false, "error" => "Invalid file path."]);
    exit;
}
if (file_exists($relativePath)) {
    if (unlink($relativePath)) {
        echo json_encode(["success" => true]);
    } else {
        http_response_code(500);
        echo json_encode(["success" => false, "error" => "Failed to delete file."]);
    }
} else {
    echo json_encode(["success" => true]); // כבר לא קיים
}
?>
