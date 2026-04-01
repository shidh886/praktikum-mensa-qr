<?php
  
  $info = isset($_REQUEST['info']) ? $_REQUEST['info'] : '';
  $cb   = isset($_REQUEST['cb'])   ? $_REQUEST['cb']   : '';

  if ($cb === '') {
    http_response_code(400);
    echo "no callback given\n";
    exit;
  }

  
  $opts = array(
    'http' => array(
      'method'        => 'PUT',
      'header'        => "Content-type: text/plain\r\n",
      'content'       => $info,
      'ignore_errors' => true   
    )
  );
  $context = stream_context_create($opts);

  
  $resp = @file_get_contents($cb, false, $context);

  
  $status = 0;
  if (isset($http_response_header[0]) &&
      preg_match('/\s(\d{3})\s/', $http_response_header[0], $m)) {
    $status = (int)$m[1];
  }

  
  header('Content-Type: text/plain; charset=utf-8');
  echo "info=" . $info . "\n";
  echo "callback=" . $cb . "\n";
  echo "callback_http_status=" . $status . "\n";
  echo "response_body:\n";
  echo $resp;

  exit;
?>

