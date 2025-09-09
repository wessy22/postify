<?php
header('Content-Type: application/json');
header('Access-Control-Allow-Origin: *');
header('Access-Control-Allow-Methods: GET, OPTIONS');
header('Access-Control-Allow-Headers: Content-Type, Authorization');

// Handle preflight OPTIONS request
if ($_SERVER['REQUEST_METHOD'] === 'OPTIONS') {
    http_response_code(200);
    exit();
}

try {
    $dataDir = __DIR__ . '/groups-status-data';
    
    // Get query parameters
    $instance = isset($_GET['instance']) ? sanitize_text_field($_GET['instance']) : '';
    $scanType = isset($_GET['scanType']) ? sanitize_text_field($_GET['scanType']) : 'groups-post-status';
    $latest = isset($_GET['latest']) ? (bool)$_GET['latest'] : true;
    $date = isset($_GET['date']) ? sanitize_text_field($_GET['date']) : '';
    
    if (!file_exists($dataDir)) {
        throw new Exception('Data directory not found');
    }
    
    if ($latest && $instance) {
        // Get latest file for specific instance
        $filename = "{$dataDir}/{$instance}_{$scanType}_latest.json";
        
        if (!file_exists($filename)) {
            throw new Exception('No data found for this instance');
        }
        
        $data = json_decode(file_get_contents($filename), true);
        if (!$data) {
            throw new Exception('Invalid data format');
        }
        
        echo json_encode($data, JSON_PRETTY_PRINT | JSON_UNESCAPED_UNICODE);
        
    } elseif ($instance && $date) {
        // Get data for specific date
        $pattern = "{$dataDir}/{$instance}_{$scanType}_{$date}*.json";
        $files = glob($pattern);
        
        if (empty($files)) {
            throw new Exception('No data found for this date');
        }
        
        // Get the latest file from that date
        sort($files);
        $filename = end($files);
        
        $data = json_decode(file_get_contents($filename), true);
        if (!$data) {
            throw new Exception('Invalid data format');
        }
        
        echo json_encode($data, JSON_PRETTY_PRINT | JSON_UNESCAPED_UNICODE);
        
    } else {
        // List all available files
        $pattern = "{$dataDir}/*_{$scanType}_*.json";
        $files = glob($pattern);
        
        $fileList = [];
        foreach ($files as $file) {
            $basename = basename($file);
            $parts = explode('_', $basename);
            
            if (count($parts) >= 4) {
                $fileInstance = $parts[0];
                $fileDate = str_replace('.json', '', $parts[3]);
                
                $fileList[] = [
                    'instance' => $fileInstance,
                    'filename' => $basename,
                    'date' => $fileDate,
                    'size' => filesize($file),
                    'modified' => date('Y-m-d H:i:s', filemtime($file))
                ];
            }
        }
        
        // Sort by date descending
        usort($fileList, function($a, $b) {
            return strcmp($b['date'], $a['date']);
        });
        
        echo json_encode([
            'success' => true,
            'files' => $fileList,
            'total' => count($fileList)
        ], JSON_PRETTY_PRINT | JSON_UNESCAPED_UNICODE);
    }
    
} catch (Exception $e) {
    http_response_code(400);
    echo json_encode([
        'success' => false,
        'error' => $e->getMessage(),
        'timestamp' => date('c')
    ]);
}

function sanitize_text_field($string) {
    return trim(preg_replace('/[^a-zA-Z0-9_.-]/', '', $string));
}
?>
