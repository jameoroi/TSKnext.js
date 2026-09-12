# ERD — Core Relational Data

```mermaid
erDiagram
  CATEGORY ||--o{ PRODUCT : groups
  BRAND ||--o{ PRODUCT : brands
  PRODUCT ||--o{ ORDER_ITEM : sold_as
  ORDER ||--|{ ORDER_ITEM : contains
  PRODUCT ||--o{ STOCK_LEDGER : moves
  ORDER ||--o{ STOCK_LEDGER : causes
  EQUIPMENT_SET ||--|{ EQUIPMENT_SET_ITEM : contains
  PRODUCT ||--o{ EQUIPMENT_SET_ITEM : included_in

  PRODUCT {
    text tenant_id PK
    text id PK
    text sku
    text name
    bigint price_satang
    int stock
    int reserved
    jsonb specs
  }
  ORDER {
    text tenant_id PK
    text id PK
    text order_no
    enum status
    text customer_id
    bigint total_satang
    text idempotency_key
    boolean stock_reserved
    boolean stock_deducted
  }
  ORDER_ITEM {
    text tenant_id PK
    text order_id PK
    int line_no PK
    text product_id
    int quantity
    bigint unit_price_satang
  }
  STOCK_LEDGER {
    text tenant_id PK
    bigint id PK
    text product_id
    enum movement
    int quantity
    int stock_after
    int reserved_after
    text order_id
  }
  EQUIPMENT_SET {
    text tenant_id PK
    text id PK
    text slug
    text name
    text status
    text discount_type
    numeric discount_value
  }
  EQUIPMENT_SET_ITEM {
    text tenant_id PK
    text set_id PK
    int line_no PK
    text product_id
    text variant_id
    int quantity
    boolean required
  }
```

Stock availability is derived as `stock - reserved`. Money in the transactional order/product tables is stored as integer satang to avoid floating-point reconciliation errors.
