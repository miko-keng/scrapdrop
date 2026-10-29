import { openRC } from "../server/restorecart/store";
import { accountTables, registerAccount } from "../server/restorecart/accounts";
import { prepareDemoShop } from "../server/restorecart/demo";
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
  if (a.role === "seller") await prepareDemoShop(db, user.id);
  console.log(
    `${a.role}: ${a.username} (${a.email}) ${existing ? "already exists; password unchanged" : "created"}`,
  );
}
db.close();
