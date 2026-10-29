import { openRC, createIncident } from "../server/restorecart/store";
import {
  accountTables,
  registerAccount,
  assignOwner,
} from "../server/restorecart/accounts";
import { addSample } from "../server/restorecart/sources";
import { reconstruct, config } from "../server/restorecart/reconstruction";
if (process.env.NODE_ENV === "production")
  throw Error("Public demo credentials are for local practice only.");
const db = openRC();
accountTables(db);
for (const a of [
  {
    role: "seller",
    username: "demo-seller",
    email: "seller.demo@restorecart.test",
    password: "RestoreSeller2026!",
  },
  {
    role: "buyer",
    username: "demo-buyer",
    email: "buyer.demo@restorecart.test",
    password: "RestoreBuyer2026!",
  },
]) {
  const existing = db
    .prepare("SELECT id,username,role FROM rc_accounts WHERE email=?")
    .get(a.email) as any;
  if (
    existing &&
    (existing.username !== a.username || existing.role !== a.role)
  )
    throw Error(
      "An unrelated account already uses the demo email. No changes made to that account.",
    );
  const user = existing || registerAccount(db, a);
  if (
    a.role === "seller" &&
    !db
      .prepare(
        "SELECT id FROM rc_owners WHERE account_id=? AND kind='incident'",
      )
      .get(user.id)
  ) {
    const shop = createIncident(db, "Sunday Studio Demo");
    assignOwner(db, "incident", shop.id, user.id);
    await addSample(db, shop.id);
    if (config().ai.mode === "fixture") await reconstruct(db, shop.id);
  }
  console.log(
    `${a.role}: ${a.username} (${a.email}) ${existing ? "already exists; password unchanged" : "created"}`,
  );
}
db.close();
