-- Script SQL para crear las tablas de la base de datos de Malamia en phpMyAdmin

-- Usar la base de datos (descomenta si creas la base de datos manualmente o cámbiala por el nombre correcto)
-- CREATE DATABASE IF NOT EXISTS `u474195689_Malamia01` DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
-- USE `u474195689_Malamia01`;

-- 1. Tabla de Usuarios (Accesos y Permisos)
CREATE TABLE IF NOT EXISTS `usuarios` (
  `id` VARCHAR(50) NOT NULL,
  `email` VARCHAR(150) NOT NULL UNIQUE,
  `password` VARCHAR(255) NOT NULL,
  `role` ENUM('admin', 'user') NOT NULL DEFAULT 'user',
  `can_edit` TINYINT(1) NOT NULL DEFAULT 0,
  `allowed_views` TEXT NOT NULL, -- Almacena array JSON de vistas permitidas (ej. '["grid", "visual", "summary"]')
  `created_at` TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- 2. Tabla de Categorías (Grupos de turnos, ej. BARRA CENTRAL, ESCENARIO)
CREATE TABLE IF NOT EXISTS `categorias` (
  `id` VARCHAR(50) NOT NULL,
  `name` VARCHAR(100) NOT NULL,
  `color` VARCHAR(7) NOT NULL, -- Código hex color (ej. '#e6b8b7')
  `position` INT NOT NULL DEFAULT 0, -- Orden de visualización
  `created_at` TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- 3. Tabla de Filas de Empleados / Subencabezados
CREATE TABLE IF NOT EXISTS `empleados_filas` (
  `id` VARCHAR(50) NOT NULL,
  `category_id` VARCHAR(50) NOT NULL,
  `type` ENUM('employee', 'subheader') NOT NULL DEFAULT 'employee',
  `name` VARCHAR(100) NOT NULL,
  `rate` DECIMAL(10, 2) NOT NULL DEFAULT 0.00,
  `status` VARCHAR(50) NOT NULL DEFAULT '',
  `role` VARCHAR(50) DEFAULT NULL,
  `position` INT NOT NULL DEFAULT 0, -- Orden de filas dentro de la categoría
  `created_at` TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  FOREIGN KEY (`category_id`) REFERENCES `categorias`(`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- 4. Tabla de Turnos (Asociados a cada día e índice de día)
CREATE TABLE IF NOT EXISTS `turnos` (
  `id` INT AUTO_INCREMENT NOT NULL,
  `row_id` VARCHAR(50) NOT NULL,
  `day_index` INT NOT NULL, -- Índice del día (ej. 1, 2, 3...)
  `start_time` VARCHAR(5) DEFAULT '', -- Hora de entrada (ej. '12:00')
  `end_time` VARCHAR(5) DEFAULT '', -- Hora de salida (ej. '20:00')
  `created_at` TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `unique_row_day` (`row_id`, `day_index`),
  FOREIGN KEY (`row_id`) REFERENCES `empleados_filas`(`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;


-- ==========================================
-- DATOS INICIALES DE PRUEBA (EJEMPLO)
-- ==========================================

-- Insertar el Administrador Inicial
INSERT IGNORE INTO `usuarios` (`id`, `email`, `password`, `role`, `can_edit`, `allowed_views`) VALUES
('admin-default-1', 'daviidjg1991@gmail.com', '637050616', 'admin', 1, '["grid", "visual", "summary"]');

-- Insertar Categorías Iniciales
INSERT IGNORE INTO `categorias` (`id`, `name`, `color`, `position`) VALUES
('cat-1', 'BARRA CENTRAL', '#e6b8b7', 1),
('cat-2', 'ESCENARIO', '#e6b8b7', 2);

-- Insertar Empleados y Subcabeceras
INSERT IGNORE INTO `empleados_filas` (`id`, `category_id`, `type`, `name`, `rate`, `status`, `role`, `position`) VALUES
('emp-claudia', 'cat-1', 'employee', 'CLAUDIA PELU', 10.00, 'PAGADO', NULL, 1),
('sub-noche', 'cat-1', 'subheader', 'NOCHE', 0.00, '', NULL, 2),
('emp-dani', 'cat-1', 'employee', 'DANI VALLADOLID', 10.00, 'PREPARADO', NULL, 3),
('emp-javi', 'cat-2', 'employee', 'JAVI DADA', 10.00, 'PAGADO', NULL, 1);

-- Insertar los Turnos de Ejemplo
INSERT IGNORE INTO `turnos` (`row_id`, `day_index`, `start_time`, `end_time`) VALUES
('emp-claudia', 1, '12:00', '20:00'),
('emp-claudia', 2, '12:00', '20:00'),
('emp-claudia', 3, '12:00', '20:00'),
('emp-dani', 1, '21:00', '02:00'),
('emp-dani', 2, '21:00', '02:00'),
('emp-javi', 1, '21:00', '07:00');
