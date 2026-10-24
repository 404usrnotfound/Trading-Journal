-- System-only, coalesced native read projection. No financial source is changed.
-- Queue credentials receive narrowly scoped functions, never tenant-table access.
CREATE TABLE app.outbox_dispatch_state (
 workspace_id uuid PRIMARY KEY REFERENCES app.workspaces(id) ON DELETE CASCADE,
 processed_revision integer NOT NULL DEFAULT 0 CHECK(processed_revision>=0),
 target_revision integer NOT NULL DEFAULT 0 CHECK(target_revision>=0),
 event_id uuid, lease_token uuid, lease_until timestamptz,
 status text NOT NULL DEFAULT 'idle' CHECK(status IN ('idle','leased','retry','failed','blocked')),
 attempts integer NOT NULL DEFAULT 0 CHECK(attempts>=0 AND attempts<=5),
 next_attempt_at timestamptz NOT NULL DEFAULT clock_timestamp(),
 last_error_code text CHECK(last_error_code IN ('scope-too-large','processing-failed','stale-source','owner-unavailable')),
 candidate jsonb CHECK(candidate IS NULL OR (jsonb_typeof(candidate)='object' AND octet_length(candidate::text)<=1048576)),
 updated_at timestamptz NOT NULL DEFAULT clock_timestamp()
);
CREATE TABLE app.native_financial_snapshots (
 workspace_id uuid PRIMARY KEY REFERENCES app.workspaces(id) ON DELETE CASCADE,
 source_revision integer NOT NULL CHECK(source_revision>0),
 event_id uuid NOT NULL, authorized_owner_id text NOT NULL,
 captured_at timestamptz NOT NULL, published_at timestamptz NOT NULL DEFAULT clock_timestamp(),
 payload jsonb NOT NULL CHECK(jsonb_typeof(payload)='object' AND octet_length(payload::text)<=1048576)
);
CREATE INDEX outbox_events_dispatch_revision_idx ON app.outbox_events(workspace_id,source_revision DESC,id);
DO $$ DECLARE t text;
BEGIN
 FOREACH t IN ARRAY ARRAY['outbox_dispatch_state','native_financial_snapshots'] LOOP
  EXECUTE format('ALTER TABLE app.%I OWNER TO journal_migrator',t);
  EXECUTE format('ALTER TABLE app.%I ENABLE ROW LEVEL SECURITY',t);
  EXECUTE format('ALTER TABLE app.%I FORCE ROW LEVEL SECURITY',t);
  EXECUTE format('CREATE POLICY %I ON app.%I FOR SELECT TO journal_app USING(workspace_id=app.current_workspace_id() AND app.actor_role(workspace_id) IS NOT NULL)',t||'_read',t);
  EXECUTE format('REVOKE ALL ON app.%I FROM PUBLIC,journal_jobs,journal_auth',t);
  EXECUTE format('GRANT SELECT ON app.%I TO journal_app',t);
 END LOOP;
END $$;
--> statement-breakpoint
CREATE FUNCTION queue.claim_financial_outbox(batch_size integer DEFAULT 2)
RETURNS TABLE(workspace_id uuid,event_id uuid,lease_token uuid,source_revision integer)
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $$
DECLARE item record; token uuid; owner_id text;
BEGIN
 IF batch_size IS NULL OR batch_size<1 OR batch_size>20 THEN RAISE EXCEPTION 'Invalid outbox claim bound' USING ERRCODE='22023'; END IF;
 INSERT INTO app.outbox_dispatch_state(workspace_id)
 SELECT DISTINCT e.workspace_id FROM app.outbox_events e
 WHERE NOT EXISTS(SELECT 1 FROM app.outbox_dispatch_state s WHERE s.workspace_id=e.workspace_id)
 ORDER BY e.workspace_id LIMIT 100 ON CONFLICT DO NOTHING;
 FOR item IN
  SELECT s.workspace_id,e.id,e.source_revision FROM app.outbox_dispatch_state s
  JOIN LATERAL(SELECT o.id,o.source_revision FROM app.outbox_events o WHERE o.workspace_id=s.workspace_id ORDER BY o.source_revision DESC,o.id LIMIT 1)e ON true
  WHERE e.source_revision>s.processed_revision AND (s.lease_until IS NULL OR s.lease_until<=clock_timestamp())
   AND (s.next_attempt_at<=clock_timestamp() OR e.source_revision>s.target_revision)
   AND (s.status<>'failed' OR e.source_revision>s.target_revision)
  ORDER BY s.next_attempt_at,s.workspace_id FOR UPDATE OF s SKIP LOCKED LIMIT batch_size
 LOOP
  SELECT m.user_id INTO owner_id FROM app.workspace_memberships m WHERE m.workspace_id=item.workspace_id AND m.role='owner' ORDER BY m.user_id LIMIT 1;
  IF owner_id IS NULL THEN
   UPDATE app.outbox_dispatch_state s SET status='blocked',last_error_code='owner-unavailable',next_attempt_at=clock_timestamp()+interval '1 minute',updated_at=clock_timestamp() WHERE s.workspace_id=item.workspace_id;
   CONTINUE;
  END IF;
  token:=gen_random_uuid();
  UPDATE app.outbox_dispatch_state s SET target_revision=item.source_revision,event_id=item.id,lease_token=token,lease_until=clock_timestamp()+interval '60 seconds',candidate=NULL,
    attempts=CASE WHEN s.target_revision<>item.source_revision THEN 1 ELSE least(s.attempts+1,5) END,status='leased',last_error_code=NULL,updated_at=clock_timestamp() WHERE s.workspace_id=item.workspace_id;
  RETURN QUERY SELECT item.workspace_id,item.id,token,item.source_revision;
 END LOOP;
END $$;
--> statement-breakpoint
CREATE FUNCTION queue.prepare_native_financial_snapshot(target_workspace uuid,token uuid)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $$
DECLARE job app.outbox_dispatch_state; revision integer; owner_id text; cash jsonb; holdings jsonb; result jsonb; captured timestamptz;
BEGIN
 SELECT * INTO job FROM app.outbox_dispatch_state s WHERE s.workspace_id=target_workspace FOR UPDATE;
 IF job.lease_token IS DISTINCT FROM token OR token IS NULL OR job.lease_until<=clock_timestamp() THEN RETURN jsonb_build_object('status','stale'); END IF;
 SELECT m.user_id INTO owner_id FROM app.workspace_memberships m WHERE m.workspace_id=target_workspace AND m.role='owner' ORDER BY m.user_id LIMIT 1;
 IF owner_id IS NULL THEN RETURN jsonb_build_object('status','blocked'); END IF;
 SELECT s.revision INTO revision FROM app.financial_state s WHERE s.workspace_id=target_workspace FOR SHARE;
 IF revision IS NULL THEN RETURN jsonb_build_object('status','stale'); END IF;
 IF revision<>job.target_revision THEN
  UPDATE app.outbox_dispatch_state s SET candidate=NULL,lease_token=NULL,lease_until=NULL,status='retry',last_error_code='stale-source',next_attempt_at=clock_timestamp(),updated_at=clock_timestamp() WHERE s.workspace_id=target_workspace;
  RETURN jsonb_build_object('status','stale');
 END IF;
 IF (SELECT count(*) FROM app.cash_buckets b WHERE b.workspace_id=target_workspace AND b.category<>'control')>2000
 OR (SELECT count(*) FROM app.holding_books b WHERE b.workspace_id=target_workspace)>2000 THEN
  RETURN jsonb_build_object('status','unavailable','reason','scope-too-large');
 END IF;
 captured:=clock_timestamp();
 SELECT coalesce(jsonb_agg(jsonb_build_object('cashBucketId',q.id,'accountId',q.account_id,'currencyId',q.currency_id,'category',q.category,'amount',q.amount) ORDER BY q.id),'[]'::jsonb) INTO cash FROM(
  SELECT b.id,b.account_id,b.currency_id,b.category,coalesce(sum(p.amount) FILTER(WHERE e.source_revision<=revision),0)::text AS amount
  FROM app.cash_buckets b LEFT JOIN app.postings p ON p.workspace_id=b.workspace_id AND p.cash_bucket_id=b.id
  LEFT JOIN app.ledger_events e ON e.workspace_id=p.workspace_id AND e.id=p.ledger_event_id
  WHERE b.workspace_id=target_workspace AND b.category<>'control' GROUP BY b.id,b.account_id,b.currency_id,b.category
 )q;
 SELECT coalesce(jsonb_agg(jsonb_build_object('holdingBookId',b.id,'accountId',b.account_id,'instrumentId',b.instrument_id,
  'instrumentVersionId',b.state#>>'{scope,instrumentVersionId}','quantityUnit',b.state#>>'{scope,unitVersionId}',
  'settlementCurrencyId',b.state#>>'{scope,settlementCurrencyId}','quantity',b.state->'openQuantity','inventoryStatus',b.state->>'status',
  'inventorySourceRevision',b.source_revision::text) ORDER BY b.id),'[]'::jsonb) INTO holdings
 FROM app.holding_books b WHERE b.workspace_id=target_workspace;
 result:=jsonb_build_object('version','native-financial-snapshot/1','sourceRevision',revision::text,'economicScope','all-recorded-events',
  'capturedAt',to_char(captured AT TIME ZONE 'UTC','YYYY-MM-DD"T"HH24:MI:SS.US"Z"'),'cash',cash,'holdings',holdings);
 IF octet_length(result::text)>1048576 THEN RETURN jsonb_build_object('status','unavailable','reason','scope-too-large'); END IF;
 UPDATE app.outbox_dispatch_state s SET candidate=result,updated_at=clock_timestamp() WHERE s.workspace_id=target_workspace;
 RETURN jsonb_build_object('status','ready','snapshot',result);
END $$;
--> statement-breakpoint
CREATE FUNCTION queue.publish_native_financial_snapshot(target_workspace uuid,token uuid)
RETURNS text LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $$
DECLARE job app.outbox_dispatch_state; revision integer; owner_id text;
BEGIN
 SELECT * INTO job FROM app.outbox_dispatch_state s WHERE s.workspace_id=target_workspace FOR UPDATE;
 IF token IS NULL OR job.lease_token IS DISTINCT FROM token OR job.lease_until<=clock_timestamp() THEN RETURN 'stale'; END IF;
 SELECT m.user_id INTO owner_id FROM app.workspace_memberships m WHERE m.workspace_id=target_workspace AND m.role='owner' ORDER BY m.user_id LIMIT 1;
 IF owner_id IS NULL THEN RETURN 'blocked'; END IF;
 SELECT s.revision INTO revision FROM app.financial_state s WHERE s.workspace_id=target_workspace FOR SHARE;
 IF job.candidate IS NULL OR (job.candidate->>'sourceRevision')::integer IS DISTINCT FROM revision THEN
  UPDATE app.outbox_dispatch_state s SET candidate=NULL,lease_token=NULL,lease_until=NULL,status='retry',last_error_code='stale-source',next_attempt_at=clock_timestamp(),updated_at=clock_timestamp() WHERE s.workspace_id=target_workspace;
  RETURN 'stale';
 END IF;
 INSERT INTO app.native_financial_snapshots(workspace_id,source_revision,event_id,authorized_owner_id,captured_at,payload)
 VALUES(target_workspace,revision,job.event_id,owner_id,(job.candidate->>'capturedAt')::timestamptz,job.candidate)
 ON CONFLICT(workspace_id) DO UPDATE SET source_revision=EXCLUDED.source_revision,event_id=EXCLUDED.event_id,authorized_owner_id=EXCLUDED.authorized_owner_id,
  captured_at=EXCLUDED.captured_at,payload=EXCLUDED.payload,published_at=clock_timestamp()
 WHERE app.native_financial_snapshots.source_revision<=EXCLUDED.source_revision;
 UPDATE app.outbox_dispatch_state s SET processed_revision=revision,target_revision=revision,lease_token=NULL,lease_until=NULL,candidate=NULL,status='idle',attempts=0,last_error_code=NULL,updated_at=clock_timestamp() WHERE s.workspace_id=target_workspace;
 RETURN 'published';
END $$;
CREATE FUNCTION queue.fail_financial_outbox(target_workspace uuid,token uuid,error_code text)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $$
BEGIN
 IF error_code NOT IN ('scope-too-large','processing-failed','owner-unavailable') THEN RAISE EXCEPTION 'Invalid failure classification' USING ERRCODE='22023'; END IF;
 UPDATE app.outbox_dispatch_state s SET lease_token=NULL,lease_until=NULL,candidate=NULL,status=CASE WHEN s.attempts>=5 THEN 'failed' ELSE 'retry' END,
  last_error_code=error_code,next_attempt_at=clock_timestamp()+make_interval(secs=>power(2,least(s.attempts,5))::integer),updated_at=clock_timestamp()
 WHERE s.workspace_id=target_workspace AND s.lease_token=token;
END $$;
DO $$ DECLARE fn regprocedure;
BEGIN
 FOREACH fn IN ARRAY ARRAY['queue.claim_financial_outbox(integer)'::regprocedure,'queue.prepare_native_financial_snapshot(uuid,uuid)'::regprocedure,'queue.publish_native_financial_snapshot(uuid,uuid)'::regprocedure,'queue.fail_financial_outbox(uuid,uuid,text)'::regprocedure] LOOP
  EXECUTE format('ALTER FUNCTION %s OWNER TO journal_migrator',fn);
  EXECUTE format('REVOKE ALL ON FUNCTION %s FROM PUBLIC,journal_app,journal_auth',fn);
  EXECUTE format('GRANT EXECUTE ON FUNCTION %s TO journal_jobs',fn);
 END LOOP;
END $$;
UPDATE app.schema_metadata SET version=15 WHERE singleton=true;
