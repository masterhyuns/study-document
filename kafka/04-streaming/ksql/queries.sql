-- KSQL 쿼리 예제 모음
-- Kafka의 스트림 데이터를 SQL로 처리하는 방법을 학습합니다

-- ========================================
-- 1. 기본 Stream과 Table 생성
-- ========================================

-- Stream 생성: 주문 이벤트
CREATE STREAM orders_stream (
  orderId VARCHAR KEY,
  userId VARCHAR,
  productId VARCHAR,
  quantity INT,
  price DOUBLE,
  orderTime BIGINT,
  status VARCHAR
) WITH (
  KAFKA_TOPIC='orders',
  VALUE_FORMAT='JSON',
  TIMESTAMP='orderTime'
);

-- Table 생성: 사용자 정보
CREATE TABLE users_table (
  userId VARCHAR PRIMARY KEY,
  username VARCHAR,
  email VARCHAR,
  registeredAt BIGINT,
  loyaltyLevel VARCHAR
) WITH (
  KAFKA_TOPIC='users',
  VALUE_FORMAT='JSON'
);

-- Table 생성: 제품 카탈로그
CREATE TABLE products_table (
  productId VARCHAR PRIMARY KEY,
  name VARCHAR,
  category VARCHAR,
  price DOUBLE,
  stock INT
) WITH (
  KAFKA_TOPIC='products',
  VALUE_FORMAT='JSON'
);

-- ========================================
-- 2. 기본 쿼리
-- ========================================

-- 모든 주문 조회
SELECT * FROM orders_stream EMIT CHANGES;

-- 특정 사용자의 주문만 필터링
SELECT * FROM orders_stream
WHERE userId = 'user123'
EMIT CHANGES;

-- 고액 주문만 선택 (1000 이상)
SELECT orderId, userId, quantity * price AS totalAmount
FROM orders_stream
WHERE quantity * price > 1000
EMIT CHANGES;

-- ========================================
-- 3. Stream 변환 및 파생
-- ========================================

-- 주문 금액 계산 Stream
CREATE STREAM orders_with_total AS
  SELECT 
    orderId,
    userId,
    productId,
    quantity,
    price,
    quantity * price AS totalAmount,
    CASE 
      WHEN quantity * price > 1000 THEN 'HIGH'
      WHEN quantity * price > 100 THEN 'MEDIUM'
      ELSE 'LOW'
    END AS orderCategory,
    status,
    orderTime
  FROM orders_stream
  EMIT CHANGES;

-- 취소된 주문만 별도 Stream으로
CREATE STREAM cancelled_orders AS
  SELECT * FROM orders_stream
  WHERE status = 'CANCELLED'
  EMIT CHANGES;

-- ========================================
-- 4. Aggregation (집계)
-- ========================================

-- 사용자별 주문 횟수 집계
CREATE TABLE user_order_counts AS
  SELECT 
    userId,
    COUNT(*) AS orderCount,
    SUM(quantity * price) AS totalSpent,
    AVG(quantity * price) AS avgOrderValue
  FROM orders_stream
  GROUP BY userId
  EMIT CHANGES;

-- 제품별 판매 통계
CREATE TABLE product_sales_stats AS
  SELECT 
    productId,
    COUNT(*) AS orderCount,
    SUM(quantity) AS totalQuantitySold,
    SUM(quantity * price) AS totalRevenue,
    MAX(quantity * price) AS maxOrderValue,
    MIN(quantity * price) AS minOrderValue
  FROM orders_stream
  GROUP BY productId
  EMIT CHANGES;

-- 상태별 주문 카운트
CREATE TABLE order_status_counts AS
  SELECT 
    status,
    COUNT(*) AS count
  FROM orders_stream
  GROUP BY status
  EMIT CHANGES;

-- ========================================
-- 5. Windowed Aggregation (시간 윈도우)
-- ========================================

-- 1시간 단위 매출 집계 (Tumbling Window)
CREATE TABLE hourly_sales AS
  SELECT 
    TIMESTAMPTOSTRING(WINDOWSTART, 'yyyy-MM-dd HH:mm:ss') AS window_start,
    TIMESTAMPTOSTRING(WINDOWEND, 'yyyy-MM-dd HH:mm:ss') AS window_end,
    COUNT(*) AS orderCount,
    SUM(quantity * price) AS totalSales,
    AVG(quantity * price) AS avgOrderValue
  FROM orders_stream
  WINDOW TUMBLING (SIZE 1 HOUR)
  GROUP BY ROWKEY
  EMIT CHANGES;

-- 사용자별 10분 슬라이딩 윈도우 집계 (Hopping Window)
CREATE TABLE user_activity_10min AS
  SELECT 
    userId,
    WINDOWSTART AS window_start,
    WINDOWEND AS window_end,
    COUNT(*) AS orderCount,
    SUM(quantity * price) AS totalSpent
  FROM orders_stream
  WINDOW HOPPING (SIZE 10 MINUTES, ADVANCE BY 5 MINUTES)
  GROUP BY userId
  EMIT CHANGES;

-- 세션 윈도우 - 30분 비활동 시 세션 종료
CREATE TABLE user_sessions AS
  SELECT 
    userId,
    COUNT(*) AS ordersInSession,
    SUM(quantity * price) AS sessionTotal,
    WINDOWSTART AS sessionStart,
    WINDOWEND AS sessionEnd
  FROM orders_stream
  WINDOW SESSION (30 MINUTES)
  GROUP BY userId
  EMIT CHANGES;

-- ========================================
-- 6. JOIN 연산
-- ========================================

-- Stream-Table Join: 주문에 사용자 정보 추가
CREATE STREAM enriched_orders AS
  SELECT 
    o.orderId,
    o.userId,
    u.username,
    u.email,
    u.loyaltyLevel,
    o.productId,
    o.quantity,
    o.price,
    o.quantity * o.price AS totalAmount
  FROM orders_stream o
  LEFT JOIN users_table u ON o.userId = u.userId
  EMIT CHANGES;

-- Stream-Table Join: 주문에 제품 정보 추가
CREATE STREAM orders_with_product_info AS
  SELECT 
    o.orderId,
    o.userId,
    o.productId,
    p.name AS productName,
    p.category AS productCategory,
    o.quantity,
    o.price AS orderPrice,
    p.price AS currentPrice,
    o.quantity * o.price AS totalAmount
  FROM orders_stream o
  LEFT JOIN products_table p ON o.productId = p.productId
  EMIT CHANGES;

-- 3-way Join: 주문 + 사용자 + 제품
CREATE STREAM fully_enriched_orders AS
  SELECT 
    o.orderId,
    o.userId,
    u.username,
    u.loyaltyLevel,
    o.productId,
    p.name AS productName,
    p.category,
    o.quantity,
    o.price,
    o.quantity * o.price AS totalAmount,
    o.orderTime
  FROM orders_stream o
  LEFT JOIN users_table u ON o.userId = u.userId
  LEFT JOIN products_table p ON o.productId = p.productId
  EMIT CHANGES;

-- Stream-Stream Join: 주문과 배송 정보 조인 (5분 윈도우)
CREATE STREAM orders_with_shipping AS
  SELECT 
    o.orderId,
    o.userId,
    o.totalAmount,
    s.shippingMethod,
    s.estimatedDelivery,
    s.shippingCost
  FROM orders_stream o
  INNER JOIN shipping_stream s 
  WITHIN 5 MINUTES
  ON o.orderId = s.orderId
  EMIT CHANGES;

-- ========================================
-- 7. 복잡한 분석 쿼리
-- ========================================

-- Top N 쿼리: 매출 상위 10개 제품
CREATE TABLE top_products AS
  SELECT 
    productId,
    SUM(quantity * price) AS revenue
  FROM orders_stream
  GROUP BY productId
  EMIT CHANGES
  LIMIT 10;

-- 이상 탐지: 평균보다 3배 이상 큰 주문
CREATE STREAM unusual_orders AS
  SELECT 
    o.orderId,
    o.userId,
    o.quantity * o.price AS orderAmount,
    avg_table.avgAmount,
    (o.quantity * o.price) / avg_table.avgAmount AS ratio
  FROM orders_stream o
  LEFT JOIN (
    SELECT AVG(quantity * price) AS avgAmount
    FROM orders_stream
  ) avg_table ON true
  WHERE o.quantity * o.price > avg_table.avgAmount * 3
  EMIT CHANGES;

-- 코호트 분석: 첫 구매 시점별 사용자 그룹
CREATE TABLE user_cohorts AS
  SELECT 
    FORMAT_DATE(FROM_UNIXTIME(MIN(orderTime)), 'yyyy-MM') AS cohort_month,
    userId,
    COUNT(*) AS orderCount,
    SUM(quantity * price) AS lifetimeValue
  FROM orders_stream
  GROUP BY userId
  EMIT CHANGES;

-- ========================================
-- 8. 실시간 대시보드용 쿼리
-- ========================================

-- 실시간 KPI 대시보드
CREATE TABLE realtime_kpis AS
  SELECT 
    'GLOBAL' AS metric_key,
    COUNT(*) AS total_orders,
    COUNT(DISTINCT userId) AS unique_customers,
    SUM(quantity * price) AS total_revenue,
    AVG(quantity * price) AS avg_order_value,
    MAX(quantity * price) AS max_order_value,
    COUNT(CASE WHEN status = 'COMPLETED' THEN 1 END) AS completed_orders,
    COUNT(CASE WHEN status = 'CANCELLED' THEN 1 END) AS cancelled_orders
  FROM orders_stream
  EMIT CHANGES;

-- 카테고리별 실시간 매출
CREATE TABLE category_sales_realtime AS
  SELECT 
    p.category,
    COUNT(*) AS orderCount,
    SUM(o.quantity) AS unitsSold,
    SUM(o.quantity * o.price) AS revenue,
    AVG(o.quantity * o.price) AS avgOrderValue
  FROM orders_stream o
  LEFT JOIN products_table p ON o.productId = p.productId
  GROUP BY p.category
  EMIT CHANGES;

-- ========================================
-- 9. 이벤트 패턴 감지
-- ========================================

-- 연속된 구매 패턴 감지 (5분 내 3건 이상)
CREATE TABLE rapid_purchases AS
  SELECT 
    userId,
    COUNT(*) AS orderCount,
    COLLECT_LIST(orderId) AS orderIds,
    WINDOWSTART AS window_start,
    WINDOWEND AS window_end
  FROM orders_stream
  WINDOW TUMBLING (SIZE 5 MINUTES)
  GROUP BY userId
  HAVING COUNT(*) >= 3
  EMIT CHANGES;

-- 장바구니 포기 패턴 (ADD_TO_CART 후 구매 없음)
CREATE STREAM cart_abandonment AS
  SELECT 
    c.userId,
    c.productId,
    c.timestamp AS cartAddTime,
    o.orderId AS orderId
  FROM cart_events c
  LEFT JOIN orders_stream o 
  WITHIN 1 HOUR
  ON c.userId = o.userId AND c.productId = o.productId
  WHERE o.orderId IS NULL
  EMIT CHANGES;

-- ========================================
-- 10. Push Queries (구독형 쿼리)
-- ========================================

-- 특정 사용자의 실시간 주문 모니터링
SELECT * FROM orders_stream
WHERE userId = 'VIP_USER_001'
EMIT CHANGES;

-- 실시간 이상 거래 알림
SELECT * FROM orders_stream
WHERE quantity * price > 10000
EMIT CHANGES;

-- ========================================
-- 11. Pull Queries (조회형 쿼리)
-- ========================================

-- 현재 사용자별 총 구매액 조회
SELECT userId, totalSpent 
FROM user_order_counts
WHERE userId = 'user123';

-- 현재 제품 재고 확인
SELECT productId, stock 
FROM products_table
WHERE productId IN ('PROD001', 'PROD002', 'PROD003');

-- ========================================
-- 12. 유용한 함수들
-- ========================================

-- 문자열 함수
CREATE STREAM orders_formatted AS
  SELECT 
    UCASE(userId) AS userIdUpper,
    LCASE(status) AS statusLower,
    CONCAT(userId, '-', orderId) AS compositeId,
    SUBSTRING(productId, 1, 4) AS productPrefix,
    LEN(orderId) AS orderIdLength
  FROM orders_stream
  EMIT CHANGES;

-- 날짜/시간 함수
CREATE STREAM orders_with_dates AS
  SELECT 
    orderId,
    TIMESTAMPTOSTRING(orderTime, 'yyyy-MM-dd HH:mm:ss') AS orderTimeFormatted,
    DATETOSTRING(orderTime, 'yyyy-MM-dd') AS orderDate,
    EXTRACT(HOUR FROM orderTime) AS orderHour,
    EXTRACT(DAY FROM orderTime) AS orderDay
  FROM orders_stream
  EMIT CHANGES;

-- 수학 함수
CREATE STREAM orders_calculations AS
  SELECT 
    orderId,
    ROUND(quantity * price, 2) AS roundedTotal,
    CEIL(quantity * price) AS ceilingTotal,
    FLOOR(quantity * price) AS floorTotal,
    ABS(quantity - 10) AS quantityDiff
  FROM orders_stream
  EMIT CHANGES;

-- ========================================
-- 13. 관리 및 모니터링
-- ========================================

-- 모든 스트림 목록
SHOW STREAMS;

-- 모든 테이블 목록
SHOW TABLES;

-- 토픽 목록
SHOW TOPICS;

-- 쿼리 목록
SHOW QUERIES;

-- 특정 쿼리 종료
TERMINATE QUERY query_id;

-- Stream/Table 삭제
DROP STREAM IF EXISTS orders_stream DELETE TOPIC;
DROP TABLE IF EXISTS users_table DELETE TOPIC;