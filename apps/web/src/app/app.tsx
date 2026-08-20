import { MotionConfig } from 'motion/react';

const architecture = [
  'React/Vite owns the browser UI.',
  'NestJS is the only application backend.',
  'Prisma is the only application-table data path.',
  'PDF bytes use signed, private Storage capabilities.',
] as const;

export function App(): React.JSX.Element {
  return (
    <MotionConfig reducedMotion="user">
      <main className="app-shell">
        <section className="hero" aria-labelledby="page-title">
          <div className="eyebrow">Secure Data Room</div>
          <h1 id="page-title">Foundation contract is ready.</h1>
          <p>
            Continue with the approved implementation plans. Do not add a second backend or expose
            application tables to the browser.
          </p>
          <ul>
            {architecture.map((item) => (
              <li key={item}>{item}</li>
            ))}
          </ul>
        </section>
      </main>
    </MotionConfig>
  );
}
