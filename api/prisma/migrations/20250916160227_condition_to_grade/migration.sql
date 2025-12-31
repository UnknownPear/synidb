-- CreateEnum
CREATE TYPE "public"."Grade" AS ENUM ('A', 'B', 'C', 'D');

-- CreateTable
CREATE TABLE "public"."Category" (
    "id" TEXT NOT NULL,
    "label" TEXT NOT NULL,
    "prefix" TEXT NOT NULL,

    CONSTRAINT "Category_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."InventoryRow" (
    "synergyId" TEXT NOT NULL,
    "categoryLbl" TEXT NOT NULL,
    "productName" TEXT NOT NULL,
    "grade" "public"."Grade" NOT NULL DEFAULT 'B',
    "testedBy" TEXT,
    "testedDate" TEXT,
    "testerComment" TEXT,
    "specs" JSONB,
    "price" DOUBLE PRECISION,
    "ebayPrice" DOUBLE PRECISION,
    "posted" BOOLEAN DEFAULT false,
    "postedAt" TEXT,
    "postedBy" TEXT,

    CONSTRAINT "InventoryRow_pkey" PRIMARY KEY ("synergyId")
);

-- CreateTable
CREATE TABLE "public"."PrefixCounter" (
    "prefix" TEXT NOT NULL,
    "nextNum" INTEGER NOT NULL DEFAULT 1,

    CONSTRAINT "PrefixCounter_pkey" PRIMARY KEY ("prefix")
);

-- CreateTable
CREATE TABLE "public"."AllocatedId" (
    "synergyId" TEXT NOT NULL,
    "prefix" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AllocatedId_pkey" PRIMARY KEY ("synergyId")
);

-- CreateIndex
CREATE UNIQUE INDEX "Category_label_key" ON "public"."Category"("label");

-- CreateIndex
CREATE UNIQUE INDEX "Category_prefix_key" ON "public"."Category"("prefix");
