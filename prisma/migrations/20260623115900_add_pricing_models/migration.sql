-- CreateTable
CREATE TABLE "PricingRule" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "shop" TEXT NOT NULL,
    "zoneLabel" TEXT NOT NULL,
    "zip3" TEXT NOT NULL,
    "price" INTEGER NOT NULL,
    "currency" TEXT NOT NULL DEFAULT 'USD',
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);

-- CreateTable
CREATE TABLE "PricingDefault" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "shop" TEXT NOT NULL,
    "price" INTEGER NOT NULL,
    "currency" TEXT NOT NULL DEFAULT 'USD'
);

-- CreateTable
CREATE TABLE "LookupEvent" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "shop" TEXT NOT NULL,
    "zip" TEXT NOT NULL,
    "zip3" TEXT NOT NULL,
    "zone" TEXT,
    "variantId" TEXT,
    "price" INTEGER,
    "served" BOOLEAN NOT NULL,
    "match" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- CreateIndex
CREATE INDEX "PricingRule_shop_zip3_idx" ON "PricingRule"("shop", "zip3");

-- CreateIndex
CREATE UNIQUE INDEX "PricingRule_shop_zip3_key" ON "PricingRule"("shop", "zip3");

-- CreateIndex
CREATE UNIQUE INDEX "PricingDefault_shop_key" ON "PricingDefault"("shop");

-- CreateIndex
CREATE INDEX "LookupEvent_shop_createdAt_idx" ON "LookupEvent"("shop", "createdAt");

-- CreateIndex
CREATE INDEX "LookupEvent_shop_zip3_idx" ON "LookupEvent"("shop", "zip3");
