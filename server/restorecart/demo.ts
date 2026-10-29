import { createIncident, incident, save, type DB } from "./store";
import { assignOwner } from "./accounts";
import { addSample, deterministicCandidates, sourceList } from "./sources";

/** Prepare only the named demo draft; never reset a shop with sales or a publication. */
export async function prepareDemoShop(db: DB, owner: string) {
  const found = db
    .prepare(
      "SELECT i.id FROM rc_incidents i JOIN rc_owners o ON o.id=i.id AND o.kind='incident' WHERE o.account_id=? AND json_extract(i.body,'$.name')='Sunday Studio Demo' ORDER BY i.rowid LIMIT 1",
    )
    .get(owner) as any;
  const shop = found
    ? incident(db, found.id)
    : createIncident(db, "Sunday Studio Demo");
  assignOwner(db, "incident", shop.id, owner);
  if (
    (shop as any).demoPrepared ||
    shop.published ||
    db.prepare("SELECT id FROM rc_orders WHERE incident=? LIMIT 1").get(shop.id)
  )
    return shop;
  if (!sourceList(db, shop.id).length) await addSample(db, shop.id);
  shop.products = deterministicCandidates(sourceList(db, shop.id));
  shop.pickup =
    "Collect at the Sunday Studio counter. Show your order receipt.";
  shop.originalUrl = "";
  shop.revision++;
  Object.assign(shop, { demoPrepared: true });
  save(db, shop);
  for (const [key, value] of Object.entries({
    [`contact:${shop.id}`]: {
      contact: "hello@sunday.example",
      hours: "Tuesday–Saturday, 10am–5pm",
      status:
        "Our main website is temporarily offline. Order here for studio pickup.",
    },
    [`counts:${shop.id}`]: {},
    [`photos:${shop.id}`]: {},
  }))
    db.prepare("INSERT OR REPLACE INTO rc_meta VALUES(?,?)").run(
      key,
      JSON.stringify(value),
    );
  return shop;
}
