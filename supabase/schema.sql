


SET statement_timeout = 0;
SET lock_timeout = 0;
SET idle_in_transaction_session_timeout = 0;
SET client_encoding = 'UTF8';
SET standard_conforming_strings = on;
SELECT pg_catalog.set_config('search_path', '', false);
SET check_function_bodies = false;
SET xmloption = content;
SET client_min_messages = warning;
SET row_security = off;


CREATE SCHEMA IF NOT EXISTS "public";


ALTER SCHEMA "public" OWNER TO "pg_database_owner";


COMMENT ON SCHEMA "public" IS 'standard public schema';



CREATE OR REPLACE FUNCTION "public"."cron_process_enrichment"() RETURNS "void"
    LANGUAGE "plpgsql" SECURITY DEFINER
    AS $$
DECLARE
  _pending INT;
BEGIN
  SELECT count(*) INTO _pending
    FROM film_enrichment_queue
    WHERE status IN ('pending', 'processing');

  IF _pending = 0 THEN
    RETURN;
  END IF;

  PERFORM invoke_enrichment_edge_function('cron');
END;
$$;


ALTER FUNCTION "public"."cron_process_enrichment"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."invoke_enrichment_edge_function"("source" "text" DEFAULT 'unknown'::"text") RETURNS "void"
    LANGUAGE "plpgsql" SECURITY DEFINER
    AS $$
DECLARE
  _url TEXT;
  _key TEXT;
  _processing INT;
  MAX_CONCURRENT CONSTANT INT := 5;
  BATCH_SIZE     CONSTANT INT := 30;
BEGIN
  -- Skip if enough workers are already running.
  -- Uses locked_at > now() - 5min to ignore stale rows (matches self-heal window
  -- in take_enrichment_batch), so stuck items don't permanently block new workers.
  SELECT count(*) INTO _processing
    FROM film_enrichment_queue
    WHERE status = 'processing'
      AND locked_at > now() - interval '5 minutes';

  IF _processing >= MAX_CONCURRENT * BATCH_SIZE THEN
    RETURN;
  END IF;

  SELECT decrypted_secret INTO _url
    FROM vault.decrypted_secrets WHERE name = 'supabase_url' LIMIT 1;
  SELECT decrypted_secret INTO _key
    FROM vault.decrypted_secrets WHERE name = 'secret_key' LIMIT 1;

  IF _url IS NULL OR _key IS NULL THEN
    RAISE WARNING 'enrichment: vault secrets not configured';
    RETURN;
  END IF;

  PERFORM net.http_post(
    url     := _url || '/functions/v1/process-enrichment',
    headers := jsonb_build_object(
      'Content-Type',  'application/json',
      'Authorization', 'Bearer ' || _key
    ),
    body    := jsonb_build_object('source', source)
  );
END;
$$;


ALTER FUNCTION "public"."invoke_enrichment_edge_function"("source" "text") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."retry_enrichment_with_tmdb_url"("p_short_url" "text", "p_tmdb_url" "text") RETURNS "text"
    LANGUAGE "plpgsql" SECURITY DEFINER
    AS $$
DECLARE
  _updated INT;
BEGIN
  UPDATE film_enrichment_queue
  SET
    tmdb_url_override = p_tmdb_url,
    status            = 'pending',
    retry_count       = 0,
    locked_at         = NULL,
    processed_at      = NULL
  WHERE letterboxd_short_url = p_short_url;

  GET DIAGNOSTICS _updated = ROW_COUNT;

  IF _updated = 0 THEN
    RAISE EXCEPTION 'No enrichment queue entry found for short URL: %', p_short_url;
  END IF;

  RETURN format('Reset %s entries for %s with TMDB override: %s', _updated, p_short_url, p_tmdb_url);
END;
$$;


ALTER FUNCTION "public"."retry_enrichment_with_tmdb_url"("p_short_url" "text", "p_tmdb_url" "text") OWNER TO "postgres";

SET default_tablespace = '';

SET default_table_access_method = "heap";


CREATE TABLE IF NOT EXISTS "public"."film_enrichment_queue" (
    "id" bigint NOT NULL,
    "letterboxd_short_url" "text" NOT NULL,
    "status" "text" DEFAULT 'pending'::"text",
    "requested_by" "uuid",
    "created_at" timestamp with time zone DEFAULT "now"(),
    "processed_at" timestamp with time zone,
    "locked_at" timestamp with time zone,
    "retry_count" integer DEFAULT 0,
    "tmdb_url_override" "text",
    CONSTRAINT "film_enrichment_queue_status_check" CHECK (("status" = ANY (ARRAY['pending'::"text", 'processing'::"text", 'done'::"text", 'failed'::"text"])))
);


ALTER TABLE "public"."film_enrichment_queue" OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."take_enrichment_batch"("batch_size" integer) RETURNS SETOF "public"."film_enrichment_queue"
    LANGUAGE "plpgsql" SECURITY DEFINER
    AS $$
DECLARE
  _processing INT;
  MAX_CONCURRENT CONSTANT INT := 5;
BEGIN
  -- Serialize concurrent callers so the concurrency check + row locking
  -- is atomic. Without this, N simultaneous edge functions all see 0
  -- processing rows and all proceed.
  PERFORM pg_advisory_xact_lock(hashtext('enrichment_batch'));

  -- Self-heal: reset items stuck in 'processing' for > 5 minutes
  UPDATE film_enrichment_queue
  SET status = 'pending', locked_at = NULL
  WHERE status = 'processing'
    AND locked_at < now() - interval '5 minutes';

  -- Concurrency check: if enough workers are already active, return empty.
  -- Uses locked_at > now() - 5min to ignore stale rows (matches self-heal above).
  SELECT count(*) INTO _processing
    FROM film_enrichment_queue
    WHERE status = 'processing'
      AND locked_at > now() - interval '5 minutes';

  IF _processing >= MAX_CONCURRENT * batch_size THEN
    RETURN;  -- empty set → EF exits gracefully
  END IF;

  -- Atomically grab and lock the next batch
  RETURN QUERY
  WITH next_batch AS (
    SELECT id
    FROM film_enrichment_queue
    WHERE status = 'pending'
      AND retry_count < 5
    ORDER BY created_at ASC
    FOR UPDATE SKIP LOCKED
    LIMIT batch_size
  )
  UPDATE film_enrichment_queue q
  SET status = 'processing', locked_at = now()
  FROM next_batch
  WHERE q.id = next_batch.id
  RETURNING q.*;
END;
$$;


ALTER FUNCTION "public"."take_enrichment_batch"("batch_size" integer) OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."trigger_enrichment_on_insert"() RETURNS "trigger"
    LANGUAGE "plpgsql" SECURITY DEFINER
    AS $$
BEGIN
  PERFORM invoke_enrichment_edge_function('trigger');
  RETURN NULL;
END;
$$;


ALTER FUNCTION "public"."trigger_enrichment_on_insert"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."update_updated_at"() RETURNS "trigger"
    LANGUAGE "plpgsql"
    AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;


ALTER FUNCTION "public"."update_updated_at"() OWNER TO "postgres";


CREATE SEQUENCE IF NOT EXISTS "public"."film_enrichment_queue_id_seq"
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER SEQUENCE "public"."film_enrichment_queue_id_seq" OWNER TO "postgres";


ALTER SEQUENCE "public"."film_enrichment_queue_id_seq" OWNED BY "public"."film_enrichment_queue"."id";



CREATE TABLE IF NOT EXISTS "public"."films" (
    "id" bigint NOT NULL,
    "title" "text" NOT NULL,
    "director" "text",
    "year" integer,
    "letterboxd_url" "text",
    "letterboxd_short_url" "text",
    "letterboxd_rating" numeric(4,2),
    "letterboxd_viewers" integer,
    "genres" "text"[] DEFAULT '{}'::"text"[],
    "country" "text"[] DEFAULT '{}'::"text"[],
    "primary_language" "text"[] DEFAULT '{}'::"text"[],
    "spoken_languages" "text"[] DEFAULT '{}'::"text"[],
    "tmdb_url" "text",
    "title_original" "text",
    "title_en" "text",
    "title_es" "text",
    "runtime_minutes" integer,
    "created_at" timestamp with time zone DEFAULT "now"(),
    "updated_at" timestamp with time zone DEFAULT "now"(),
    "tmdb_id" integer,
    "directors" "jsonb" DEFAULT '[]'::"jsonb",
    "top_cast" "jsonb" DEFAULT '[]'::"jsonb",
    "keywords" "jsonb" DEFAULT '[]'::"jsonb",
    "tmdb_rating" numeric(4,2),
    "tmdb_votes" integer,
    "production_companies" "jsonb" DEFAULT '[]'::"jsonb",
    "collection_name" "text",
    "collection_id" integer,
    "overview" "text",
    "tagline" "text"
);


ALTER TABLE "public"."films" OWNER TO "postgres";


CREATE SEQUENCE IF NOT EXISTS "public"."films_id_seq"
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER SEQUENCE "public"."films_id_seq" OWNER TO "postgres";


ALTER SEQUENCE "public"."films_id_seq" OWNED BY "public"."films"."id";



CREATE OR REPLACE VIEW "public"."films_overview" AS
SELECT
    NULL::bigint AS "id",
    NULL::"text" AS "title",
    NULL::"text" AS "director",
    NULL::integer AS "year",
    NULL::"text" AS "letterboxd_url",
    NULL::"text" AS "letterboxd_short_url",
    NULL::numeric(4,2) AS "letterboxd_rating",
    NULL::integer AS "letterboxd_viewers",
    NULL::"text"[] AS "genres",
    NULL::"text"[] AS "country",
    NULL::"text"[] AS "primary_language",
    NULL::"text"[] AS "spoken_languages",
    NULL::"text" AS "tmdb_url",
    NULL::"text" AS "title_original",
    NULL::"text" AS "title_en",
    NULL::"text" AS "title_es",
    NULL::integer AS "runtime_minutes",
    NULL::timestamp with time zone AS "created_at",
    NULL::timestamp with time zone AS "updated_at",
    NULL::bigint AS "screening_count",
    NULL::timestamp with time zone AS "first_screening",
    NULL::timestamp with time zone AS "last_screening";


ALTER VIEW "public"."films_overview" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."screenings" (
    "id" bigint NOT NULL,
    "film_id" bigint NOT NULL,
    "showtime" timestamp with time zone NOT NULL,
    "location" "text" DEFAULT 'Unknown'::"text" NOT NULL,
    "url_tickets" "text" DEFAULT ''::"text",
    "url_info" "text" DEFAULT ''::"text",
    "version" "text",
    "created_at" timestamp with time zone DEFAULT "now"()
);


ALTER TABLE "public"."screenings" OWNER TO "postgres";


CREATE SEQUENCE IF NOT EXISTS "public"."screenings_id_seq"
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER SEQUENCE "public"."screenings_id_seq" OWNER TO "postgres";


ALTER SEQUENCE "public"."screenings_id_seq" OWNED BY "public"."screenings"."id";



CREATE TABLE IF NOT EXISTS "public"."user_preferences" (
    "user_id" "uuid" NOT NULL,
    "lang" "text" DEFAULT 'es'::"text",
    "watchlist_urls" "text"[] DEFAULT '{}'::"text"[],
    "watched_urls" "text"[] DEFAULT '{}'::"text"[],
    "watchlist_active" boolean DEFAULT false,
    "watched_active" boolean DEFAULT false,
    "created_at" timestamp with time zone DEFAULT "now"(),
    "updated_at" timestamp with time zone DEFAULT "now"(),
    "watched_ratings" "jsonb" DEFAULT '{}'::"jsonb",
    CONSTRAINT "user_preferences_lang_check" CHECK (("lang" = ANY (ARRAY['es'::"text", 'en'::"text"])))
);


ALTER TABLE "public"."user_preferences" OWNER TO "postgres";


ALTER TABLE ONLY "public"."film_enrichment_queue" ALTER COLUMN "id" SET DEFAULT "nextval"('"public"."film_enrichment_queue_id_seq"'::"regclass");



ALTER TABLE ONLY "public"."films" ALTER COLUMN "id" SET DEFAULT "nextval"('"public"."films_id_seq"'::"regclass");



ALTER TABLE ONLY "public"."screenings" ALTER COLUMN "id" SET DEFAULT "nextval"('"public"."screenings_id_seq"'::"regclass");



ALTER TABLE ONLY "public"."film_enrichment_queue"
    ADD CONSTRAINT "film_enrichment_queue_letterboxd_short_url_key" UNIQUE ("letterboxd_short_url");



ALTER TABLE ONLY "public"."film_enrichment_queue"
    ADD CONSTRAINT "film_enrichment_queue_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."films"
    ADD CONSTRAINT "films_letterboxd_short_url_unique" UNIQUE ("letterboxd_short_url");



ALTER TABLE ONLY "public"."films"
    ADD CONSTRAINT "films_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."screenings"
    ADD CONSTRAINT "screenings_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."user_preferences"
    ADD CONSTRAINT "user_preferences_pkey" PRIMARY KEY ("user_id");



CREATE INDEX "idx_enrichment_status" ON "public"."film_enrichment_queue" USING "btree" ("status");



CREATE INDEX "idx_films_letterboxd" ON "public"."films" USING "btree" ("letterboxd_short_url");



CREATE UNIQUE INDEX "idx_films_letterboxd_short_url_unique" ON "public"."films" USING "btree" ("letterboxd_short_url") WHERE ("letterboxd_short_url" IS NOT NULL);



CREATE INDEX "idx_films_tmdb_id" ON "public"."films" USING "btree" ("tmdb_id");



CREATE INDEX "idx_screenings_film_id" ON "public"."screenings" USING "btree" ("film_id");



CREATE INDEX "idx_screenings_showtime" ON "public"."screenings" USING "btree" ("showtime");



CREATE UNIQUE INDEX "idx_screenings_unique" ON "public"."screenings" USING "btree" ("film_id", "showtime", "location");



CREATE OR REPLACE VIEW "public"."films_overview" AS
 SELECT "f"."id",
    "f"."title",
    "f"."director",
    "f"."year",
    "f"."letterboxd_url",
    "f"."letterboxd_short_url",
    "f"."letterboxd_rating",
    "f"."letterboxd_viewers",
    "f"."genres",
    "f"."country",
    "f"."primary_language",
    "f"."spoken_languages",
    "f"."tmdb_url",
    "f"."title_original",
    "f"."title_en",
    "f"."title_es",
    "f"."runtime_minutes",
    "f"."created_at",
    "f"."updated_at",
    "count"("s"."id") AS "screening_count",
    "min"("s"."showtime") AS "first_screening",
    "max"("s"."showtime") AS "last_screening"
   FROM ("public"."films" "f"
     LEFT JOIN "public"."screenings" "s" ON (("s"."film_id" = "f"."id")))
  GROUP BY "f"."id";



CREATE OR REPLACE TRIGGER "films_updated_at" BEFORE UPDATE ON "public"."films" FOR EACH ROW EXECUTE FUNCTION "public"."update_updated_at"();



CREATE OR REPLACE TRIGGER "on_enrichment_queue_insert" AFTER INSERT ON "public"."film_enrichment_queue" FOR EACH STATEMENT EXECUTE FUNCTION "public"."trigger_enrichment_on_insert"();



CREATE OR REPLACE TRIGGER "user_preferences_updated_at" BEFORE UPDATE ON "public"."user_preferences" FOR EACH ROW EXECUTE FUNCTION "public"."update_updated_at"();



ALTER TABLE ONLY "public"."film_enrichment_queue"
    ADD CONSTRAINT "film_enrichment_queue_requested_by_fkey" FOREIGN KEY ("requested_by") REFERENCES "auth"."users"("id");



ALTER TABLE ONLY "public"."screenings"
    ADD CONSTRAINT "screenings_film_id_fkey" FOREIGN KEY ("film_id") REFERENCES "public"."films"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."user_preferences"
    ADD CONSTRAINT "user_preferences_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "auth"."users"("id") ON DELETE CASCADE;



CREATE POLICY "Authenticated users can insert films" ON "public"."films" FOR INSERT WITH CHECK (("auth"."uid"() IS NOT NULL));



CREATE POLICY "Authenticated users can insert queue items" ON "public"."film_enrichment_queue" FOR INSERT WITH CHECK (("auth"."uid"() IS NOT NULL));



CREATE POLICY "Authenticated users can read queue" ON "public"."film_enrichment_queue" FOR SELECT USING (("auth"."uid"() IS NOT NULL));



CREATE POLICY "Authenticated users can update films" ON "public"."films" FOR UPDATE USING (("auth"."uid"() IS NOT NULL));



CREATE POLICY "Authenticated users can update queue" ON "public"."film_enrichment_queue" FOR UPDATE USING (("auth"."uid"() IS NOT NULL));



CREATE POLICY "Public read films" ON "public"."films" FOR SELECT USING (true);



CREATE POLICY "Public read screenings" ON "public"."screenings" FOR SELECT USING (true);



CREATE POLICY "Service role can manage queue" ON "public"."film_enrichment_queue" USING (("auth"."role"() = 'service_role'::"text")) WITH CHECK (("auth"."role"() = 'service_role'::"text"));



CREATE POLICY "Service write films" ON "public"."films" USING (("auth"."role"() = 'service_role'::"text")) WITH CHECK (("auth"."role"() = 'service_role'::"text"));



CREATE POLICY "Service write screenings" ON "public"."screenings" USING (("auth"."role"() = 'service_role'::"text")) WITH CHECK (("auth"."role"() = 'service_role'::"text"));



CREATE POLICY "Users delete own preferences" ON "public"."user_preferences" FOR DELETE USING (("auth"."uid"() = "user_id"));



CREATE POLICY "Users insert own preferences" ON "public"."user_preferences" FOR INSERT WITH CHECK (("auth"."uid"() = "user_id"));



CREATE POLICY "Users read own preferences" ON "public"."user_preferences" FOR SELECT USING (("auth"."uid"() = "user_id"));



CREATE POLICY "Users update own preferences" ON "public"."user_preferences" FOR UPDATE USING (("auth"."uid"() = "user_id")) WITH CHECK (("auth"."uid"() = "user_id"));



ALTER TABLE "public"."film_enrichment_queue" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."films" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."screenings" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."user_preferences" ENABLE ROW LEVEL SECURITY;


GRANT USAGE ON SCHEMA "public" TO "postgres";
GRANT USAGE ON SCHEMA "public" TO "anon";
GRANT USAGE ON SCHEMA "public" TO "authenticated";
GRANT USAGE ON SCHEMA "public" TO "service_role";



GRANT ALL ON FUNCTION "public"."cron_process_enrichment"() TO "anon";
GRANT ALL ON FUNCTION "public"."cron_process_enrichment"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."cron_process_enrichment"() TO "service_role";



GRANT ALL ON FUNCTION "public"."invoke_enrichment_edge_function"("source" "text") TO "anon";
GRANT ALL ON FUNCTION "public"."invoke_enrichment_edge_function"("source" "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."invoke_enrichment_edge_function"("source" "text") TO "service_role";



GRANT ALL ON FUNCTION "public"."retry_enrichment_with_tmdb_url"("p_short_url" "text", "p_tmdb_url" "text") TO "anon";
GRANT ALL ON FUNCTION "public"."retry_enrichment_with_tmdb_url"("p_short_url" "text", "p_tmdb_url" "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."retry_enrichment_with_tmdb_url"("p_short_url" "text", "p_tmdb_url" "text") TO "service_role";



GRANT ALL ON TABLE "public"."film_enrichment_queue" TO "anon";
GRANT ALL ON TABLE "public"."film_enrichment_queue" TO "authenticated";
GRANT ALL ON TABLE "public"."film_enrichment_queue" TO "service_role";



GRANT ALL ON FUNCTION "public"."take_enrichment_batch"("batch_size" integer) TO "anon";
GRANT ALL ON FUNCTION "public"."take_enrichment_batch"("batch_size" integer) TO "authenticated";
GRANT ALL ON FUNCTION "public"."take_enrichment_batch"("batch_size" integer) TO "service_role";



GRANT ALL ON FUNCTION "public"."trigger_enrichment_on_insert"() TO "anon";
GRANT ALL ON FUNCTION "public"."trigger_enrichment_on_insert"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."trigger_enrichment_on_insert"() TO "service_role";



GRANT ALL ON FUNCTION "public"."update_updated_at"() TO "anon";
GRANT ALL ON FUNCTION "public"."update_updated_at"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."update_updated_at"() TO "service_role";



GRANT ALL ON SEQUENCE "public"."film_enrichment_queue_id_seq" TO "anon";
GRANT ALL ON SEQUENCE "public"."film_enrichment_queue_id_seq" TO "authenticated";
GRANT ALL ON SEQUENCE "public"."film_enrichment_queue_id_seq" TO "service_role";



GRANT ALL ON TABLE "public"."films" TO "anon";
GRANT ALL ON TABLE "public"."films" TO "authenticated";
GRANT ALL ON TABLE "public"."films" TO "service_role";



GRANT ALL ON SEQUENCE "public"."films_id_seq" TO "anon";
GRANT ALL ON SEQUENCE "public"."films_id_seq" TO "authenticated";
GRANT ALL ON SEQUENCE "public"."films_id_seq" TO "service_role";



GRANT ALL ON TABLE "public"."films_overview" TO "anon";
GRANT ALL ON TABLE "public"."films_overview" TO "authenticated";
GRANT ALL ON TABLE "public"."films_overview" TO "service_role";



GRANT ALL ON TABLE "public"."screenings" TO "anon";
GRANT ALL ON TABLE "public"."screenings" TO "authenticated";
GRANT ALL ON TABLE "public"."screenings" TO "service_role";



GRANT ALL ON SEQUENCE "public"."screenings_id_seq" TO "anon";
GRANT ALL ON SEQUENCE "public"."screenings_id_seq" TO "authenticated";
GRANT ALL ON SEQUENCE "public"."screenings_id_seq" TO "service_role";



GRANT ALL ON TABLE "public"."user_preferences" TO "anon";
GRANT ALL ON TABLE "public"."user_preferences" TO "authenticated";
GRANT ALL ON TABLE "public"."user_preferences" TO "service_role";



ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON SEQUENCES TO "postgres";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON SEQUENCES TO "anon";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON SEQUENCES TO "authenticated";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON SEQUENCES TO "service_role";






ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON FUNCTIONS TO "postgres";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON FUNCTIONS TO "anon";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON FUNCTIONS TO "authenticated";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON FUNCTIONS TO "service_role";






ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON TABLES TO "postgres";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON TABLES TO "anon";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON TABLES TO "authenticated";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON TABLES TO "service_role";







