// The local-install component's storage surface: Better Auth's Convex
// adapter CRUD, generated over this component's schema. These functions are
// component functions — reachable only across the component boundary by
// this deployment's own code, never by a client.
import { createApi } from "@convex-dev/better-auth";
import { createAuthOptions } from "../auth.js";
import schema from "./schema.js";

export const { create, findOne, findMany, updateOne, updateMany, deleteOne, deleteMany } =
  createApi(schema, createAuthOptions);
