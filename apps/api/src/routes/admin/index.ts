import { Hono } from "hono";
import type { HonoEnv } from "../../env";
import { adminAuth } from "../../middleware/adminAuth";
import { activationsAdmin } from "./activations";
import { blacklistAdmin } from "./blacklist";
import { customersAdmin } from "./customers";
import { licensesAdmin } from "./licenses";
import { productsAdmin } from "./products";
import { statsAdmin } from "./stats";

/** JSON admin API. Mounted at /v1/admin and gated by Cloudflare Access (or ADMIN_TOKEN). */
export const adminApi = new Hono<HonoEnv>();

adminApi.use("*", adminAuth);
adminApi.route("/products", productsAdmin);
adminApi.route("/licenses", licensesAdmin);
adminApi.route("/customers", customersAdmin);
adminApi.route("/activations", activationsAdmin);
adminApi.route("/blacklist", blacklistAdmin);
adminApi.route("/stats", statsAdmin);
