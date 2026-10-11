CREATE TYPE "public"."actor_type" AS ENUM('CUSTOMER', 'COURIER', 'RESTAURANT_SIM', 'ADMIN', 'SYSTEM');--> statement-breakpoint
CREATE TYPE "public"."assignment_end_reason" AS ENUM('DELIVERED', 'RELEASED_BY_COURIER', 'UNASSIGNED_BY_ADMIN', 'ORDER_CANCELLED', 'DELIVERY_FAILED');--> statement-breakpoint
CREATE TYPE "public"."courier_status" AS ENUM('PENDING', 'APPROVED', 'REJECTED', 'SUSPENDED');--> statement-breakpoint
CREATE TYPE "public"."notification_type" AS ENUM('ORDER_PLACED', 'ORDER_CONFIRMED', 'ORDER_READY', 'COURIER_ASSIGNED', 'COURIER_RELEASED', 'ORDER_PICKED_UP', 'ORDER_DELIVERED', 'ORDER_CANCELLED', 'DELIVERY_FAILED', 'COURIER_APPLICATION_DECIDED');--> statement-breakpoint
CREATE TYPE "public"."order_status" AS ENUM('PLACED', 'CONFIRMED', 'READY_FOR_PICKUP', 'ASSIGNED', 'PICKED_UP', 'DELIVERED', 'CANCELLED', 'DELIVERY_FAILED');--> statement-breakpoint
CREATE TYPE "public"."payment_provider" AS ENUM('DEMO');--> statement-breakpoint
CREATE TYPE "public"."payment_status" AS ENUM('AUTHORIZED', 'CAPTURED', 'VOIDED');--> statement-breakpoint
CREATE TYPE "public"."transport_mode" AS ENUM('WALK', 'BIKE', 'SCOOTER');--> statement-breakpoint
CREATE TYPE "public"."user_role" AS ENUM('STUDENT', 'ADMIN');--> statement-breakpoint
CREATE TABLE "accounts" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"account_id" text NOT NULL,
	"provider_id" text NOT NULL,
	"password" text,
	"access_token" text,
	"refresh_token" text,
	"id_token" text,
	"access_token_expires_at" timestamp with time zone,
	"refresh_token_expires_at" timestamp with time zone,
	"scope" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "sessions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"token" text NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"ip_address" text,
	"user_agent" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "users" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" varchar(100) NOT NULL,
	"email" varchar(254) NOT NULL,
	"email_verified" boolean DEFAULT false NOT NULL,
	"image" text,
	"role" "user_role" DEFAULT 'STUDENT' NOT NULL,
	"suspended_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "users_email_lowercase" CHECK ("users"."email" = lower("users"."email"))
);
--> statement-breakpoint
CREATE TABLE "verifications" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"identifier" text NOT NULL,
	"value" text NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "campus_locations" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"campus_id" uuid NOT NULL,
	"name" varchar(120) NOT NULL,
	"short_name" varchar(40) NOT NULL,
	"description" text,
	"is_drop_point" boolean DEFAULT true NOT NULL,
	"sort_order" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"deleted_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "campuses" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"slug" varchar(40) NOT NULL,
	"name" varchar(120) NOT NULL,
	"timezone" varchar(64) NOT NULL,
	"delivery_fee_cents" integer NOT NULL,
	"service_fee_bps" integer NOT NULL,
	"service_fee_min_cents" integer NOT NULL,
	"service_fee_max_cents" integer NOT NULL,
	"tax_rate_bps" integer NOT NULL,
	"min_subtotal_cents" integer NOT NULL,
	"max_tip_cents" integer NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "campuses_delivery_fee_nonneg" CHECK ("campuses"."delivery_fee_cents" >= 0),
	CONSTRAINT "campuses_service_fee_bps_range" CHECK ("campuses"."service_fee_bps" between 0 and 10000),
	CONSTRAINT "campuses_tax_bps_range" CHECK ("campuses"."tax_rate_bps" between 0 and 10000),
	CONSTRAINT "campuses_service_fee_bounds" CHECK ("campuses"."service_fee_min_cents" >= 0 and "campuses"."service_fee_min_cents" <= "campuses"."service_fee_max_cents"),
	CONSTRAINT "campuses_min_subtotal_nonneg" CHECK ("campuses"."min_subtotal_cents" >= 0),
	CONSTRAINT "campuses_max_tip_nonneg" CHECK ("campuses"."max_tip_cents" >= 0)
);
--> statement-breakpoint
CREATE TABLE "cart_item_options" (
	"cart_item_id" uuid NOT NULL,
	"menu_option_id" uuid NOT NULL,
	CONSTRAINT "cart_item_options_cart_item_id_menu_option_id_pk" PRIMARY KEY("cart_item_id","menu_option_id")
);
--> statement-breakpoint
CREATE TABLE "cart_items" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"cart_id" uuid NOT NULL,
	"restaurant_id" uuid NOT NULL,
	"menu_item_id" uuid NOT NULL,
	"quantity" integer NOT NULL,
	"special_instructions" varchar(140),
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "cart_items_quantity_range" CHECK ("cart_items"."quantity" between 1 and 20)
);
--> statement-breakpoint
CREATE TABLE "carts" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"restaurant_id" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "carts_id_restaurant_unique" UNIQUE("id","restaurant_id")
);
--> statement-breakpoint
CREATE TABLE "cuisines" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"slug" varchar(40) NOT NULL,
	"name" varchar(60) NOT NULL
);
--> statement-breakpoint
CREATE TABLE "menu_categories" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"restaurant_id" uuid NOT NULL,
	"name" varchar(60) NOT NULL,
	"sort_order" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"deleted_at" timestamp with time zone,
	CONSTRAINT "menu_categories_id_restaurant_unique" UNIQUE("id","restaurant_id")
);
--> statement-breakpoint
CREATE TABLE "menu_items" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"restaurant_id" uuid NOT NULL,
	"category_id" uuid NOT NULL,
	"name" varchar(80) NOT NULL,
	"description" varchar(300),
	"price_cents" integer NOT NULL,
	"image_path" text,
	"is_available" boolean DEFAULT true NOT NULL,
	"sort_order" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"deleted_at" timestamp with time zone,
	CONSTRAINT "menu_items_id_restaurant_unique" UNIQUE("id","restaurant_id"),
	CONSTRAINT "menu_items_price_nonneg" CHECK ("menu_items"."price_cents" >= 0)
);
--> statement-breakpoint
CREATE TABLE "menu_option_groups" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"menu_item_id" uuid NOT NULL,
	"name" varchar(60) NOT NULL,
	"min_select" smallint DEFAULT 0 NOT NULL,
	"max_select" smallint DEFAULT 1 NOT NULL,
	"sort_order" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"deleted_at" timestamp with time zone,
	CONSTRAINT "menu_option_groups_min_nonneg" CHECK ("menu_option_groups"."min_select" >= 0),
	CONSTRAINT "menu_option_groups_max_valid" CHECK ("menu_option_groups"."max_select" >= 1 and "menu_option_groups"."max_select" >= "menu_option_groups"."min_select")
);
--> statement-breakpoint
CREATE TABLE "menu_options" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"option_group_id" uuid NOT NULL,
	"name" varchar(60) NOT NULL,
	"price_delta_cents" integer DEFAULT 0 NOT NULL,
	"is_available" boolean DEFAULT true NOT NULL,
	"sort_order" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"deleted_at" timestamp with time zone,
	CONSTRAINT "menu_options_price_delta_nonneg" CHECK ("menu_options"."price_delta_cents" >= 0)
);
--> statement-breakpoint
CREATE TABLE "restaurant_cuisines" (
	"restaurant_id" uuid NOT NULL,
	"cuisine_id" uuid NOT NULL,
	CONSTRAINT "restaurant_cuisines_restaurant_id_cuisine_id_pk" PRIMARY KEY("restaurant_id","cuisine_id")
);
--> statement-breakpoint
CREATE TABLE "restaurant_hours" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"restaurant_id" uuid NOT NULL,
	"day_of_week" smallint NOT NULL,
	"opens_at_minute" smallint NOT NULL,
	"closes_at_minute" smallint NOT NULL,
	CONSTRAINT "restaurant_hours_day_range" CHECK ("restaurant_hours"."day_of_week" between 0 and 6),
	CONSTRAINT "restaurant_hours_opens_range" CHECK ("restaurant_hours"."opens_at_minute" between 0 and 1439),
	CONSTRAINT "restaurant_hours_closes_after_opens" CHECK ("restaurant_hours"."closes_at_minute" > "restaurant_hours"."opens_at_minute" and "restaurant_hours"."closes_at_minute" <= 2880)
);
--> statement-breakpoint
CREATE TABLE "restaurants" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"campus_id" uuid NOT NULL,
	"location_id" uuid NOT NULL,
	"slug" varchar(80) NOT NULL,
	"name" varchar(80) NOT NULL,
	"description" text,
	"image_path" text,
	"pickup_notes" text,
	"is_accepting_orders" boolean DEFAULT true NOT NULL,
	"is_sample_data" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"deleted_at" timestamp with time zone,
	CONSTRAINT "restaurants_slug_format" CHECK ("restaurants"."slug" ~ '^[a-z0-9]+(-[a-z0-9]+)*$')
);
--> statement-breakpoint
CREATE TABLE "delivery_assignments" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"order_id" uuid NOT NULL,
	"courier_id" uuid NOT NULL,
	"assigned_at" timestamp with time zone DEFAULT now() NOT NULL,
	"picked_up_at" timestamp with time zone,
	"ended_at" timestamp with time zone,
	"end_reason" "assignment_end_reason",
	"payout_cents" integer,
	CONSTRAINT "delivery_assignments_end_consistent" CHECK (("delivery_assignments"."ended_at" is null) = ("delivery_assignments"."end_reason" is null)),
	CONSTRAINT "delivery_assignments_payout_only_when_delivered" CHECK ("delivery_assignments"."payout_cents" is null or ("delivery_assignments"."end_reason" = 'DELIVERED' and "delivery_assignments"."payout_cents" >= 0))
);
--> statement-breakpoint
CREATE TABLE "delivery_offer_declines" (
	"order_id" uuid NOT NULL,
	"courier_id" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "delivery_offer_declines_order_id_courier_id_pk" PRIMARY KEY("order_id","courier_id")
);
--> statement-breakpoint
CREATE TABLE "notifications" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"type" "notification_type" NOT NULL,
	"order_id" uuid,
	"title" varchar(80) NOT NULL,
	"body" varchar(200) NOT NULL,
	"read_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "reviews" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"order_id" uuid NOT NULL,
	"customer_id" uuid NOT NULL,
	"courier_id" uuid NOT NULL,
	"rating" smallint NOT NULL,
	"comment" varchar(500),
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "reviews_rating_range" CHECK ("reviews"."rating" between 1 and 5)
);
--> statement-breakpoint
CREATE TABLE "audit_events" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"actor_type" "actor_type" NOT NULL,
	"actor_user_id" uuid,
	"action" varchar(64) NOT NULL,
	"target_type" varchar(40) NOT NULL,
	"target_id" text NOT NULL,
	"metadata" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"request_id" varchar(64),
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "audit_events_actor_kind" CHECK ("audit_events"."actor_type" in ('ADMIN', 'SYSTEM')),
	CONSTRAINT "audit_events_admin_has_user" CHECK ("audit_events"."actor_type" <> 'ADMIN' or "audit_events"."actor_user_id" is not null),
	CONSTRAINT "audit_events_action_format" CHECK ("audit_events"."action" ~ '^[a-z_]+(\.[a-z_]+)+$')
);
--> statement-breakpoint
CREATE TABLE "rate_limit_buckets" (
	"key" varchar(200) NOT NULL,
	"window_start" timestamp with time zone NOT NULL,
	"count" integer NOT NULL,
	CONSTRAINT "rate_limit_buckets_key_window_start_pk" PRIMARY KEY("key","window_start")
);
--> statement-breakpoint
CREATE TABLE "order_item_options" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"order_item_id" uuid NOT NULL,
	"menu_option_id" uuid NOT NULL,
	"group_name_snapshot" varchar(60) NOT NULL,
	"option_name_snapshot" varchar(60) NOT NULL,
	"price_delta_cents" integer NOT NULL,
	CONSTRAINT "order_item_options_price_nonneg" CHECK ("order_item_options"."price_delta_cents" >= 0)
);
--> statement-breakpoint
CREATE TABLE "order_items" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"order_id" uuid NOT NULL,
	"restaurant_id" uuid NOT NULL,
	"menu_item_id" uuid NOT NULL,
	"name_snapshot" varchar(80) NOT NULL,
	"unit_price_cents" integer NOT NULL,
	"options_total_cents" integer NOT NULL,
	"quantity" integer NOT NULL,
	"line_total_cents" integer NOT NULL,
	"special_instructions" varchar(140),
	CONSTRAINT "order_items_prices_nonneg" CHECK ("order_items"."unit_price_cents" >= 0 and "order_items"."options_total_cents" >= 0),
	CONSTRAINT "order_items_quantity_range" CHECK ("order_items"."quantity" between 1 and 20),
	CONSTRAINT "order_items_line_total" CHECK ("order_items"."line_total_cents" = ("order_items"."unit_price_cents" + "order_items"."options_total_cents") * "order_items"."quantity")
);
--> statement-breakpoint
CREATE TABLE "order_status_events" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"order_id" uuid NOT NULL,
	"from_status" "order_status",
	"to_status" "order_status" NOT NULL,
	"actor_type" "actor_type" NOT NULL,
	"actor_user_id" uuid,
	"reason" varchar(300),
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "order_status_events_actor_user" CHECK ("order_status_events"."actor_type" in ('SYSTEM', 'RESTAURANT_SIM') or "order_status_events"."actor_user_id" is not null)
);
--> statement-breakpoint
CREATE TABLE "orders" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"order_number" varchar(16) NOT NULL,
	"customer_id" uuid NOT NULL,
	"campus_id" uuid NOT NULL,
	"restaurant_id" uuid NOT NULL,
	"restaurant_name_snapshot" varchar(80) NOT NULL,
	"delivery_location_id" uuid NOT NULL,
	"delivery_location_snapshot" varchar(120) NOT NULL,
	"delivery_instructions" varchar(280),
	"status" "order_status" DEFAULT 'PLACED' NOT NULL,
	"status_updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"subtotal_cents" integer NOT NULL,
	"delivery_fee_cents" integer NOT NULL,
	"service_fee_cents" integer NOT NULL,
	"tax_cents" integer NOT NULL,
	"tip_cents" integer NOT NULL,
	"total_cents" integer NOT NULL,
	"currency" char(3) DEFAULT 'USD' NOT NULL,
	"idempotency_key" uuid NOT NULL,
	"request_hash" char(64) NOT NULL,
	"version" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "orders_id_restaurant_unique" UNIQUE("id","restaurant_id"),
	CONSTRAINT "orders_order_number_format" CHECK ("orders"."order_number" ~ '^CC-[0-9A-Z]{5,12}$'),
	CONSTRAINT "orders_amounts_nonneg" CHECK ("orders"."subtotal_cents" >= 0 and "orders"."delivery_fee_cents" >= 0 and "orders"."service_fee_cents" >= 0 and "orders"."tax_cents" >= 0 and "orders"."tip_cents" >= 0),
	CONSTRAINT "orders_total_is_sum" CHECK ("orders"."total_cents" = "orders"."subtotal_cents" + "orders"."delivery_fee_cents" + "orders"."service_fee_cents" + "orders"."tax_cents" + "orders"."tip_cents"),
	CONSTRAINT "orders_currency_usd" CHECK ("orders"."currency" = 'USD'),
	CONSTRAINT "orders_version_nonneg" CHECK ("orders"."version" >= 0)
);
--> statement-breakpoint
CREATE TABLE "payments" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"order_id" uuid NOT NULL,
	"provider" "payment_provider" NOT NULL,
	"status" "payment_status" NOT NULL,
	"amount_cents" integer NOT NULL,
	"provider_reference" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "payments_amount_nonneg" CHECK ("payments"."amount_cents" >= 0)
);
--> statement-breakpoint
CREATE TABLE "courier_profiles" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"status" "courier_status" DEFAULT 'PENDING' NOT NULL,
	"transport_mode" "transport_mode" NOT NULL,
	"guidelines_accepted_at" timestamp with time zone NOT NULL,
	"is_online" boolean DEFAULT false NOT NULL,
	"online_since" timestamp with time zone,
	"applied_at" timestamp with time zone DEFAULT now() NOT NULL,
	"reviewed_at" timestamp with time zone,
	"reviewed_by_user_id" uuid,
	"review_note" varchar(500),
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "courier_profiles_online_requires_approval" CHECK (not "courier_profiles"."is_online" or "courier_profiles"."status" = 'APPROVED')
);
--> statement-breakpoint
CREATE TABLE "user_profiles" (
	"user_id" uuid PRIMARY KEY NOT NULL,
	"display_name" varchar(60),
	"default_location_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "accounts" ADD CONSTRAINT "accounts_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sessions" ADD CONSTRAINT "sessions_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "campus_locations" ADD CONSTRAINT "campus_locations_campus_id_campuses_id_fk" FOREIGN KEY ("campus_id") REFERENCES "public"."campuses"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "cart_item_options" ADD CONSTRAINT "cart_item_options_cart_item_id_cart_items_id_fk" FOREIGN KEY ("cart_item_id") REFERENCES "public"."cart_items"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "cart_item_options" ADD CONSTRAINT "cart_item_options_menu_option_id_menu_options_id_fk" FOREIGN KEY ("menu_option_id") REFERENCES "public"."menu_options"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "cart_items" ADD CONSTRAINT "cart_items_cart_fk" FOREIGN KEY ("cart_id","restaurant_id") REFERENCES "public"."carts"("id","restaurant_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "cart_items" ADD CONSTRAINT "cart_items_item_same_restaurant_fk" FOREIGN KEY ("menu_item_id","restaurant_id") REFERENCES "public"."menu_items"("id","restaurant_id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "carts" ADD CONSTRAINT "carts_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "carts" ADD CONSTRAINT "carts_restaurant_id_restaurants_id_fk" FOREIGN KEY ("restaurant_id") REFERENCES "public"."restaurants"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "menu_categories" ADD CONSTRAINT "menu_categories_restaurant_id_restaurants_id_fk" FOREIGN KEY ("restaurant_id") REFERENCES "public"."restaurants"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "menu_items" ADD CONSTRAINT "menu_items_restaurant_id_restaurants_id_fk" FOREIGN KEY ("restaurant_id") REFERENCES "public"."restaurants"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "menu_items" ADD CONSTRAINT "menu_items_category_same_restaurant_fk" FOREIGN KEY ("category_id","restaurant_id") REFERENCES "public"."menu_categories"("id","restaurant_id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "menu_option_groups" ADD CONSTRAINT "menu_option_groups_menu_item_id_menu_items_id_fk" FOREIGN KEY ("menu_item_id") REFERENCES "public"."menu_items"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "menu_options" ADD CONSTRAINT "menu_options_option_group_id_menu_option_groups_id_fk" FOREIGN KEY ("option_group_id") REFERENCES "public"."menu_option_groups"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "restaurant_cuisines" ADD CONSTRAINT "restaurant_cuisines_restaurant_id_restaurants_id_fk" FOREIGN KEY ("restaurant_id") REFERENCES "public"."restaurants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "restaurant_cuisines" ADD CONSTRAINT "restaurant_cuisines_cuisine_id_cuisines_id_fk" FOREIGN KEY ("cuisine_id") REFERENCES "public"."cuisines"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "restaurant_hours" ADD CONSTRAINT "restaurant_hours_restaurant_id_restaurants_id_fk" FOREIGN KEY ("restaurant_id") REFERENCES "public"."restaurants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "restaurants" ADD CONSTRAINT "restaurants_campus_id_campuses_id_fk" FOREIGN KEY ("campus_id") REFERENCES "public"."campuses"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "restaurants" ADD CONSTRAINT "restaurants_location_id_campus_locations_id_fk" FOREIGN KEY ("location_id") REFERENCES "public"."campus_locations"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "delivery_assignments" ADD CONSTRAINT "delivery_assignments_order_id_orders_id_fk" FOREIGN KEY ("order_id") REFERENCES "public"."orders"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "delivery_assignments" ADD CONSTRAINT "delivery_assignments_courier_id_courier_profiles_id_fk" FOREIGN KEY ("courier_id") REFERENCES "public"."courier_profiles"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "delivery_offer_declines" ADD CONSTRAINT "delivery_offer_declines_order_id_orders_id_fk" FOREIGN KEY ("order_id") REFERENCES "public"."orders"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "delivery_offer_declines" ADD CONSTRAINT "delivery_offer_declines_courier_id_courier_profiles_id_fk" FOREIGN KEY ("courier_id") REFERENCES "public"."courier_profiles"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "notifications" ADD CONSTRAINT "notifications_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "notifications" ADD CONSTRAINT "notifications_order_id_orders_id_fk" FOREIGN KEY ("order_id") REFERENCES "public"."orders"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "reviews" ADD CONSTRAINT "reviews_order_id_orders_id_fk" FOREIGN KEY ("order_id") REFERENCES "public"."orders"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "reviews" ADD CONSTRAINT "reviews_customer_id_users_id_fk" FOREIGN KEY ("customer_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "reviews" ADD CONSTRAINT "reviews_courier_id_courier_profiles_id_fk" FOREIGN KEY ("courier_id") REFERENCES "public"."courier_profiles"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "audit_events" ADD CONSTRAINT "audit_events_actor_user_id_users_id_fk" FOREIGN KEY ("actor_user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "order_item_options" ADD CONSTRAINT "order_item_options_order_item_id_order_items_id_fk" FOREIGN KEY ("order_item_id") REFERENCES "public"."order_items"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "order_item_options" ADD CONSTRAINT "order_item_options_menu_option_id_menu_options_id_fk" FOREIGN KEY ("menu_option_id") REFERENCES "public"."menu_options"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "order_items" ADD CONSTRAINT "order_items_order_fk" FOREIGN KEY ("order_id","restaurant_id") REFERENCES "public"."orders"("id","restaurant_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "order_items" ADD CONSTRAINT "order_items_item_same_restaurant_fk" FOREIGN KEY ("menu_item_id","restaurant_id") REFERENCES "public"."menu_items"("id","restaurant_id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "order_status_events" ADD CONSTRAINT "order_status_events_order_id_orders_id_fk" FOREIGN KEY ("order_id") REFERENCES "public"."orders"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "order_status_events" ADD CONSTRAINT "order_status_events_actor_user_id_users_id_fk" FOREIGN KEY ("actor_user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "orders" ADD CONSTRAINT "orders_customer_id_users_id_fk" FOREIGN KEY ("customer_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "orders" ADD CONSTRAINT "orders_campus_id_campuses_id_fk" FOREIGN KEY ("campus_id") REFERENCES "public"."campuses"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "orders" ADD CONSTRAINT "orders_restaurant_id_restaurants_id_fk" FOREIGN KEY ("restaurant_id") REFERENCES "public"."restaurants"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "orders" ADD CONSTRAINT "orders_delivery_location_id_campus_locations_id_fk" FOREIGN KEY ("delivery_location_id") REFERENCES "public"."campus_locations"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "payments" ADD CONSTRAINT "payments_order_id_orders_id_fk" FOREIGN KEY ("order_id") REFERENCES "public"."orders"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "courier_profiles" ADD CONSTRAINT "courier_profiles_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "courier_profiles" ADD CONSTRAINT "courier_profiles_reviewed_by_user_id_users_id_fk" FOREIGN KEY ("reviewed_by_user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "user_profiles" ADD CONSTRAINT "user_profiles_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "user_profiles" ADD CONSTRAINT "user_profiles_default_location_id_campus_locations_id_fk" FOREIGN KEY ("default_location_id") REFERENCES "public"."campus_locations"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "accounts_user_id_idx" ON "accounts" USING btree ("user_id");--> statement-breakpoint
CREATE UNIQUE INDEX "accounts_provider_account_unique" ON "accounts" USING btree ("provider_id","account_id");--> statement-breakpoint
CREATE UNIQUE INDEX "sessions_token_unique" ON "sessions" USING btree ("token");--> statement-breakpoint
CREATE INDEX "sessions_user_id_idx" ON "sessions" USING btree ("user_id");--> statement-breakpoint
CREATE UNIQUE INDEX "users_email_unique" ON "users" USING btree ("email");--> statement-breakpoint
CREATE INDEX "verifications_identifier_idx" ON "verifications" USING btree ("identifier");--> statement-breakpoint
CREATE UNIQUE INDEX "campus_locations_name_unique" ON "campus_locations" USING btree ("campus_id","name") WHERE "campus_locations"."deleted_at" is null;--> statement-breakpoint
CREATE UNIQUE INDEX "campuses_slug_unique" ON "campuses" USING btree ("slug");--> statement-breakpoint
CREATE INDEX "cart_items_cart_idx" ON "cart_items" USING btree ("cart_id");--> statement-breakpoint
CREATE UNIQUE INDEX "carts_user_unique" ON "carts" USING btree ("user_id");--> statement-breakpoint
CREATE UNIQUE INDEX "cuisines_slug_unique" ON "cuisines" USING btree ("slug");--> statement-breakpoint
CREATE UNIQUE INDEX "menu_categories_name_unique" ON "menu_categories" USING btree ("restaurant_id","name") WHERE "menu_categories"."deleted_at" is null;--> statement-breakpoint
CREATE INDEX "menu_items_listing_idx" ON "menu_items" USING btree ("restaurant_id","category_id","sort_order") WHERE "menu_items"."deleted_at" is null;--> statement-breakpoint
CREATE INDEX "menu_option_groups_item_idx" ON "menu_option_groups" USING btree ("menu_item_id");--> statement-breakpoint
CREATE INDEX "menu_options_group_idx" ON "menu_options" USING btree ("option_group_id");--> statement-breakpoint
CREATE UNIQUE INDEX "restaurant_hours_slot_unique" ON "restaurant_hours" USING btree ("restaurant_id","day_of_week","opens_at_minute");--> statement-breakpoint
CREATE UNIQUE INDEX "restaurants_slug_unique" ON "restaurants" USING btree ("slug");--> statement-breakpoint
CREATE INDEX "restaurants_campus_active_idx" ON "restaurants" USING btree ("campus_id") WHERE "restaurants"."deleted_at" is null;--> statement-breakpoint
CREATE UNIQUE INDEX "delivery_assignments_one_active_per_order" ON "delivery_assignments" USING btree ("order_id") WHERE "delivery_assignments"."ended_at" is null;--> statement-breakpoint
CREATE UNIQUE INDEX "delivery_assignments_one_active_per_courier" ON "delivery_assignments" USING btree ("courier_id") WHERE "delivery_assignments"."ended_at" is null;--> statement-breakpoint
CREATE INDEX "delivery_assignments_courier_history_idx" ON "delivery_assignments" USING btree ("courier_id","assigned_at" DESC NULLS LAST);--> statement-breakpoint
CREATE INDEX "notifications_user_created_idx" ON "notifications" USING btree ("user_id","created_at" DESC NULLS LAST);--> statement-breakpoint
CREATE INDEX "notifications_user_unread_idx" ON "notifications" USING btree ("user_id") WHERE "notifications"."read_at" is null;--> statement-breakpoint
CREATE UNIQUE INDEX "reviews_order_unique" ON "reviews" USING btree ("order_id");--> statement-breakpoint
CREATE INDEX "reviews_courier_idx" ON "reviews" USING btree ("courier_id");--> statement-breakpoint
CREATE INDEX "audit_events_created_idx" ON "audit_events" USING btree ("created_at" DESC NULLS LAST);--> statement-breakpoint
CREATE INDEX "audit_events_target_idx" ON "audit_events" USING btree ("target_type","target_id");--> statement-breakpoint
CREATE INDEX "rate_limit_buckets_window_idx" ON "rate_limit_buckets" USING btree ("window_start");--> statement-breakpoint
CREATE INDEX "order_item_options_item_idx" ON "order_item_options" USING btree ("order_item_id");--> statement-breakpoint
CREATE INDEX "order_items_order_idx" ON "order_items" USING btree ("order_id");--> statement-breakpoint
CREATE INDEX "order_status_events_order_idx" ON "order_status_events" USING btree ("order_id","created_at");--> statement-breakpoint
CREATE UNIQUE INDEX "orders_order_number_unique" ON "orders" USING btree ("order_number");--> statement-breakpoint
CREATE UNIQUE INDEX "orders_customer_idempotency_unique" ON "orders" USING btree ("customer_id","idempotency_key");--> statement-breakpoint
CREATE INDEX "orders_customer_history_idx" ON "orders" USING btree ("customer_id","created_at" DESC NULLS LAST);--> statement-breakpoint
CREATE INDEX "orders_ready_offers_idx" ON "orders" USING btree ("status_updated_at") WHERE "orders"."status" = 'READY_FOR_PICKUP';--> statement-breakpoint
CREATE INDEX "orders_status_created_idx" ON "orders" USING btree ("status","created_at" DESC NULLS LAST);--> statement-breakpoint
CREATE INDEX "orders_restaurant_created_idx" ON "orders" USING btree ("restaurant_id","created_at" DESC NULLS LAST);--> statement-breakpoint
CREATE UNIQUE INDEX "payments_order_unique" ON "payments" USING btree ("order_id");--> statement-breakpoint
CREATE UNIQUE INDEX "courier_profiles_user_unique" ON "courier_profiles" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "courier_profiles_status_idx" ON "courier_profiles" USING btree ("status");--> statement-breakpoint
CREATE INDEX "courier_profiles_online_idx" ON "courier_profiles" USING btree ("id") WHERE "courier_profiles"."is_online";