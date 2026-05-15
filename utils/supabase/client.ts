import { createBrowserClient } from "@supabase/ssr";

const supabaseUrl = "https://ujleoivhkomnzlrsxtdw.supabase.co";
const supabaseKey = "sb_publishable_OtX_h6bZjhHF9nnkM-WH6w_gw4lNFlg";

export const createClient = () =>
  createBrowserClient(supabaseUrl, supabaseKey);
