<?php
header('Content-Type: application/json');
header('Access-Control-Allow-Origin: *');
header('Access-Control-Allow-Methods: POST, GET, OPTIONS');
header('Access-Control-Allow-Headers: Content-Type, Authorization');

// Handle preflight OPTIONS request
if ($_SERVER['REQUEST_METHOD'] === 'OPTIONS') {
    http_response_code(200);
    exit();
}

// Only allow POST requests
if ($_SERVER['REQUEST_METHOD'] !== 'POST') {
    http_response_code(405);
    echo json_encode(['error' => 'Method not allowed']);
    exit();
}

try {
    // Get raw POST data
    $input = file_get_contents('php://input');
    $data = json_decode($input, true);
    
    if (!$data) {
        throw new Exception('Invalid JSON data');
    }
    
    // Validate required fields
    if (!isset($data['instance']) || !isset($data['scanType']) || !isset($data['data'])) {
        throw new Exception('Missing required fields: instance, scanType, data');
    }
    
    $instance = sanitize_text_field($data['instance']);
    $scanType = sanitize_text_field($data['scanType']);
    $scanData = $data['data'];
    
    // Create data directory if it doesn't exist
    $dataDir = __DIR__ . '/groups-status-data';
    if (!file_exists($dataDir)) {
        mkdir($dataDir, 0755, true);
    }
    
    // Create filename with timestamp
    $timestamp = date('Y-m-d_H-i-s');
    $filename = "{$dataDir}/{$instance}_{$scanType}_{$timestamp}.json";
    
    // Prepare data to save
    $saveData = [
        'instance' => $instance,
        'scanType' => $scanType,
        'timestamp' => date('Y-m-d H:i:s'),
        'uploadTime' => date('c'),
        'data' => $scanData
    ];
    
    // Save to file
    $result = file_put_contents($filename, json_encode($saveData, JSON_PRETTY_PRINT | JSON_UNESCAPED_UNICODE));
    
    if ($result === false) {
        throw new Exception('Failed to save data to file');
    }
    
    // Also save as latest file for easy access
    $latestFilename = "{$dataDir}/{$instance}_{$scanType}_latest.json";
    file_put_contents($latestFilename, json_encode($saveData, JSON_PRETTY_PRINT | JSON_UNESCAPED_UNICODE));
    
    // Log the activity
    $logFile = "{$dataDir}/upload_log.txt";
    $logEntry = "[" . date('Y-m-d H:i:s') . "] Uploaded data from {$instance} - {$scanType} - " . 
                (isset($scanData['totalGroups']) ? $scanData['totalGroups'] : 'unknown') . " groups\n";
    file_put_contents($logFile, $logEntry, FILE_APPEND | LOCK_EX);
    
    // Return success response
    http_response_code(200);
    echo json_encode([
        'success' => true,
        'message' => 'Data saved successfully',
        'filename' => basename($filename),
        'timestamp' => $timestamp,
        'dataSize' => strlen($input),
        'groupCount' => isset($scanData['totalGroups']) ? $scanData['totalGroups'] : 0
    ]);
    
} catch (Exception $e) {
    http_response_code(400);
    echo json_encode([
        'success' => false,
        'error' => $e->getMessage(),
        'timestamp' => date('c')
    ]);
}

// Helper function for sanitization
function sanitize_text_field($string) {
    return trim(preg_replace('/[^a-zA-Z0-9_-]/', '', $string));
}
?>
