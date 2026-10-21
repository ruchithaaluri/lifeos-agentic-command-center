async function run() {
  const r = await fetch('http://localhost:3000/signin');
  console.log('Signin Status:', r.status);
  const html = await r.text();
  const cssMatch = html.match(/href="(\/_next\/static\/css\/[^"]+)"/);
  console.log('CSS URL:', cssMatch ? cssMatch[1] : 'NOT FOUND');
  if (cssMatch) {
    const cssRes = await fetch('http://localhost:3000' + cssMatch[1]);
    console.log('CSS Status:', cssRes.status);
    const css = await cssRes.text();
    console.log('CSS Length:', css.length);
    console.log('CSS Preview:', css.slice(0, 150));
  }
}

run().catch((e) => console.error(e));
