-- Disable foreign key checks temporarily (optional, less critical if using IF NOT EXISTS)
SET FOREIGN_KEY_CHECKS = 0;

-- Drop tables if they already exist to ensure a clean slate on re-run (REMOVE THIS SECTION ENTIRELY)
-- DROP TABLE IF EXISTS `activities`;
-- DROP TABLE IF EXISTS `group_members`;
-- DROP TABLE IF EXISTS `groups`;
-- DROP TABLE IF EXISTS `users`;

--
-- Table structure for table `users`
--
-- This table must be created first as it is referenced by other tables.
--
CREATE TABLE IF NOT EXISTS `users` ( -- ADDED IF NOT EXISTS
    `id` INT(11) AUTO_INCREMENT PRIMARY KEY,
    `name` VARCHAR(255) NOT NULL,
    `email` VARCHAR(255) NOT NULL UNIQUE,
    `password` VARCHAR(255) NOT NULL,
    `role` ENUM('patient','staff','family') NOT NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

--
-- Table structure for table `groups`
--
-- This table must be created after `users` as it references `users`.
--
CREATE TABLE IF NOT EXISTS `groups` ( -- ADDED IF NOT EXISTS
    `id` INT(11) AUTO_INCREMENT PRIMARY KEY,
    `patient_id` INT(11) NOT NULL,
    `staff_id` INT(11) NOT NULL,
    FOREIGN KEY (`patient_id`) REFERENCES `users`(`id`) ON UPDATE RESTRICT ON DELETE RESTRICT,
    FOREIGN KEY (`staff_id`) REFERENCES `users`(`id`) ON UPDATE RESTRICT ON DELETE RESTRICT
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

--
-- Table structure for table `group_members`
--
-- This table must be created after `users` and `groups` as it references both.
--
CREATE TABLE IF NOT EXISTS `group_members` ( -- ADDED IF NOT EXISTS
    `group_id` INT(11) NOT NULL,
    `user_id` INT(11) NOT NULL,
    PRIMARY KEY (`group_id`, `user_id`),
    FOREIGN KEY (`group_id`) REFERENCES `groups`(`id`) ON UPDATE RESTRICT ON DELETE RESTRICT,
    FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE RESTRICT ON DELETE RESTRICT
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

--
-- Table structure for table `activities`
--
-- This table must be created after `groups` as it references `groups`.
--
CREATE TABLE IF NOT EXISTS `activities` ( -- ADDED IF NOT EXISTS
    `id` INT(11) AUTO_INCREMENT PRIMARY KEY,
    `group_id` INT(11) NOT NULL,
    `activity` VARCHAR(255) NOT NULL,
    `description` TEXT,
    `created_at` TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (`group_id`) REFERENCES `groups`(`id`) ON UPDATE RESTRICT ON DELETE RESTRICT
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Re-enable foreign key checks (optional, but good practice)
SET FOREIGN_KEY_CHECKS = 1;