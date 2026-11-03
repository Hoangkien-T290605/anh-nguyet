-- MySQL dump 10.13  Distrib 8.4.13, for Win64 (x86_64)
--
-- Host: localhost    Database: anh_nguyet
-- ------------------------------------------------------
-- Server version	8.4.13

/*!40101 SET @OLD_CHARACTER_SET_CLIENT=@@CHARACTER_SET_CLIENT */;
/*!40101 SET @OLD_CHARACTER_SET_RESULTS=@@CHARACTER_SET_RESULTS */;
/*!40101 SET @OLD_COLLATION_CONNECTION=@@COLLATION_CONNECTION */;
/*!50503 SET NAMES utf8mb4 */;
/*!40103 SET @OLD_TIME_ZONE=@@TIME_ZONE */;
/*!40103 SET TIME_ZONE='+00:00' */;
/*!40014 SET @OLD_UNIQUE_CHECKS=@@UNIQUE_CHECKS, UNIQUE_CHECKS=0 */;
/*!40014 SET @OLD_FOREIGN_KEY_CHECKS=@@FOREIGN_KEY_CHECKS, FOREIGN_KEY_CHECKS=0 */;
/*!40101 SET @OLD_SQL_MODE=@@SQL_MODE, SQL_MODE='NO_AUTO_VALUE_ON_ZERO' */;
/*!40111 SET @OLD_SQL_NOTES=@@SQL_NOTES, SQL_NOTES=0 */;

--
-- Table structure for table `products`
--

DROP TABLE IF EXISTS `products`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `products` (
  `id` int unsigned NOT NULL AUTO_INCREMENT,
  `name` varchar(255) NOT NULL,
  `description` text,
  `price` decimal(12,2) NOT NULL,
  `category` varchar(100) NOT NULL,
  `image` varchar(2048) DEFAULT '',
  `stock` int unsigned NOT NULL DEFAULT '0',
  `featured` tinyint(1) NOT NULL DEFAULT '0',
  `active` tinyint(1) NOT NULL DEFAULT '1',
  `created_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`)
) ENGINE=InnoDB AUTO_INCREMENT=15 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Dumping data for table `products`
--

LOCK TABLES `products` WRITE;
/*!40000 ALTER TABLE `products` DISABLE KEYS */;
INSERT INTO `products` VALUES (3,'Bánh tráng gạo mè','Bánh tráng làm từ gạo, kết hợp mè thơm ngon.',35000.00,'Bánh từ gạo','',50,1,1,'2026-11-03 02:34:13','2026-11-03 02:34:13'),(4,'Bột gạo nguyên chất','Bột gạo nguyên chất dùng trong chế biến thực phẩm.',45000.00,'Bột gạo','',30,0,1,'2026-11-03 02:34:13','2026-11-03 02:34:13'),(5,'Hộp quà đặc sản từ gạo','Hộp quà gồm các sản phẩm đặc sản được chế biến từ gạo.',150000.00,'Quà tặng','',20,1,1,'2026-11-03 02:34:13','2026-11-03 02:34:13'),(9,'Bánh tráng gạo mè','Bánh tráng làm từ gạo, kết hợp mè thơm ngon.',35000.00,'Bánh từ gạo','',50,1,1,'2026-11-03 02:39:16','2026-11-03 02:39:16'),(10,'Bột gạo nguyên chất','Bột gạo nguyên chất dùng trong chế biến thực phẩm.',45000.00,'Bột gạo','',30,0,1,'2026-11-03 02:39:16','2026-11-03 02:39:16'),(11,'Hộp quà đặc sản từ gạo','Hộp quà gồm các sản phẩm đặc sản được chế biến từ gạo.',150000.00,'Quà tặng','',20,1,1,'2026-11-03 02:39:16','2026-11-03 02:39:16'),(12,'Bánh tráng gạo mè','Bánh tráng làm từ gạo, kết hợp mè thơm ngon.',35000.00,'Bánh từ gạo','',50,1,1,'2026-11-03 02:39:34','2026-11-03 02:39:34'),(13,'Bột gạo nguyên chất','Bột gạo nguyên chất dùng trong chế biến thực phẩm.',45000.00,'Bột gạo','',30,0,1,'2026-11-03 02:39:34','2026-11-03 02:39:34'),(14,'Hộp quà đặc sản từ gạo','Hộp quà gồm các sản phẩm đặc sản được chế biến từ gạo.',150000.00,'Quà tặng','',20,1,1,'2026-11-03 02:39:34','2026-11-03 02:39:34');
/*!40000 ALTER TABLE `products` ENABLE KEYS */;
UNLOCK TABLES;
/*!40103 SET TIME_ZONE=@OLD_TIME_ZONE */;

/*!40101 SET SQL_MODE=@OLD_SQL_MODE */;
/*!40014 SET FOREIGN_KEY_CHECKS=@OLD_FOREIGN_KEY_CHECKS */;
/*!40014 SET UNIQUE_CHECKS=@OLD_UNIQUE_CHECKS */;
/*!40101 SET CHARACTER_SET_CLIENT=@OLD_CHARACTER_SET_CLIENT */;
/*!40101 SET CHARACTER_SET_RESULTS=@OLD_CHARACTER_SET_RESULTS */;
/*!40101 SET COLLATION_CONNECTION=@OLD_COLLATION_CONNECTION */;
/*!40111 SET SQL_NOTES=@OLD_SQL_NOTES */;

-- Dump completed on 2026-11-03  9:59:18
