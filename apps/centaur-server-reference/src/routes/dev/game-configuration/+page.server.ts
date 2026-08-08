// The standalone mount is a development affordance and answers 404 anywhere
// else — a fork that builds this app for production does not serve an
// unauthenticated configuration surface, and the guard is the build's rather
// than a reviewer's memory.
import { dev } from "$app/environment";
import { error } from "@sveltejs/kit";
import type { PageServerLoad } from "./$types";

export const load: PageServerLoad = () => {
  if (!dev) error(404, "not found");
  return {};
};
