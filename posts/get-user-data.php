<?php
header('Content-Type: application/json');

$hostname = $_GET['hostname'] ?? '';
if (!$hostname) {
  echo json_encode(['error' => 'Missing hostname']);
  exit;
}

$conn = new mysqli("localhost", "postr3xd_up1", "hvr%4ho2iaQN3Hfd_6", "postr3xd_up1");
$conn->set_charset("utf8mb4");

// ========== שליפת הגדרות משתמש ==========
$userSettings = null;
$userEmail = null; // מייל הלקוח
try {
    // שליפה מטבלת users לפי hostname
    $userQuery = $conn->prepare("SELECT max_posts_per_day, max_publications_per_day, delay_between_posts_minutes, enable_smart_distribution, enable_sabbath_shutdown, email FROM users WHERE hostname = ? LIMIT 1");
    $userQuery->bind_param("s", $hostname);
    $userQuery->execute();
    $userResult = $userQuery->get_result();
    
    if ($userResult && $userResult->num_rows > 0) {
        $row = $userResult->fetch_assoc();
        $userSettings = $row;
        $userEmail = $row['email']; // שמירת המייל מעמודת email
        $settingsSource = 'database_users_table';
    } else {
        // אם לא נמצא לפי hostname, נסה לפי שדות אחרים אם יש
        $userQuery2 = $conn->prepare("SELECT max_posts_per_day, max_publications_per_day, delay_between_posts_minutes, enable_smart_distribution, enable_sabbath_shutdown, email FROM users WHERE user_login = ? OR display_name = ? LIMIT 1");
        $userQuery2->bind_param("ss", $hostname, $hostname);
        $userQuery2->execute();
        $userResult2 = $userQuery2->get_result();
        
        if ($userResult2 && $userResult2->num_rows > 0) {
            $row = $userResult2->fetch_assoc();
            $userSettings = $row;
            $userEmail = $row['email']; // שמירת המייל מעמודת email
            $settingsSource = 'database_users_table';
        }
    }
} catch (Exception $e) {
    error_log("Users table query failed: " . $e->getMessage());
    $settingsSource = 'error_fallback_to_default';
}

// ברירת מחדל אם לא נמצאו הגדרות
if (!$userSettings) {
    $userSettings = [
        'max_posts_per_day' => 4,
        'max_publications_per_day' => 100,
        'delay_between_posts_minutes' => 10,
        'enable_smart_distribution' => 1,
        'enable_sabbath_shutdown' => 1
    ];
    $settingsSource = 'default_settings';
}

// ========== שליפת פוסטים (הקוד הקיים שלך) ==========
$result = [];

// שליפת פוסטים כולל כל שדות התזמון והסטטוס
$posts = $conn->query("SELECT id, name, title, text, collection_id, status, publish_time, schedule_type, days_of_week, monthly_date, one_time_date, repeat_mode, start_date, end_date FROM posts WHERE hostname = '$hostname'");
while ($post = $posts->fetch_assoc()) {
  $postId = $post['id'];

  // תמונות
  $images = $conn->query("SELECT image_path FROM post_images WHERE post_id = $postId");
  $post['images'] = array_column($images->fetch_all(MYSQLI_ASSOC), 'image_path');

  // קבוצות לפי collection_id
  $groups = [];
  if (!empty($post['collection_id'])) {
    $collectionId = (int)$post['collection_id'];
    $res = $conn->query("SELECT group_url FROM groups WHERE collection_id = $collectionId");
    while ($row = $res->fetch_assoc()) $groups[] = $row['group_url'];
  }
  $post['groups'] = $groups;

  $result[] = $post;
}

// ========== החזרת תוצאות משולבות ==========
$response = [
    'posts' => $result,
    'user_settings' => [
        'email' => $userEmail, // מייל הלקוח
        'max_posts_per_day' => (int)$userSettings['max_posts_per_day'],
        'max_publications_per_day' => (int)$userSettings['max_publications_per_day'],
        'delay_between_posts_minutes' => (int)$userSettings['delay_between_posts_minutes'],
        'enable_smart_distribution' => (int)$userSettings['enable_smart_distribution'],
        'enable_sabbath_shutdown' => (int)$userSettings['enable_sabbath_shutdown'],
        'hostname' => $hostname,
        'last_fetched' => date('Y-m-d H:i:s'),
        'source' => $settingsSource ?? 'unknown'
    ]
];

echo json_encode($response, JSON_UNESCAPED_UNICODE);
?>