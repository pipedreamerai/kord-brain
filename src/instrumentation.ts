export async function register() {
  if (process.env.NEXT_RUNTIME === 'nodejs') {
    const { getTagIndex } = await import('./lib/tagIndex');
    await getTagIndex().catch((err: unknown) => {
      console.warn('[instrumentation] tag index pre-warm failed:', err);
    });
  }
}
