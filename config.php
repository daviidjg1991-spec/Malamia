<?php
// Configuración de la base de datos MySQL de Malamia
define('DB_HOST', 'localhost'); // El host por defecto suele ser localhost en Hostinger/cPanel
define('DB_NAME', 'u474195689_Malamia01');
define('DB_USER', 'u474195689_Malamia01');
define('DB_PASSWORD', 'D@viid12');

// Conexión a la base de datos utilizando PDO (más seguro y moderno)
try {
    $pdo = new PDO(
        "mysql:host=" . DB_HOST . ";dbname=" . DB_NAME . ";charset=utf8mb4",
        DB_USER,
        DB_PASSWORD,
        [
            PDO::ATTR_ERRMODE => PDO::ERRMODE_EXCEPTION,
            PDO::ATTR_DEFAULT_FETCH_MODE => PDO::FETCH_ASSOC,
            PDO::ATTR_EMULATE_PREPARES => false,
        ]
    );
} catch (PDOException $e) {
    // En producción es mejor no mostrar el mensaje de error directamente por seguridad, 
    // pero lo dejamos habilitado para tu depuración inicial.
    die("Error de conexión a la base de datos: " . $e->getMessage());
}
?>
