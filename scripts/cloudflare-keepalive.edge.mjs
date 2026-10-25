import probe from './cloudflare-keepalive.mjs';
const edgeTest = {
  async test() {
    await probe.scheduled({ scheduledTime: Date.now(), cron: 'edge-regression' });
  },
};

export default edgeTest;
