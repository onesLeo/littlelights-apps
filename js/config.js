// Where posts are stored.
//
// Leave both values empty to use LOCAL MODE: posts and uploaded files are kept in
// this browser only. Good for trying the Studio; nobody else sees the posts.
//
// Fill both in to use SUPABASE MODE (see docs/studio.md). The anon key is meant to
// be public: the database's row-level security rules decide who may write.
window.LL_CONFIG = {
  supabaseUrl: 'https://svlvlmyugyadmehjwudm.supabase.co',
  supabaseAnonKey: 'sb_publishable_PpHntUeaf4RbeeYWStKpVw_RlYdUQFV'
};
