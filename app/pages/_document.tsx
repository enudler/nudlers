import { Html, Head, Main, NextScript } from 'next/document';

export default function Document() {
  return (
    <Html>
      <Head>
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="anonymous" />
        <link href="https://fonts.googleapis.com/css2?family=Assistant:wght@400;500;600;700&display=swap" rel="stylesheet" />
        <link rel="icon" href="data:image/svg+xml,<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 100 100'><rect x='10' y='10' width='80' height='80' rx='15' fill='black'/><text x='50%' y='50%' dominant-baseline='middle' text-anchor='middle' fill='white' style='font-family: Roboto, sans-serif; font-weight: 700; font-size: 60px;'>C</text></svg>" />
        <meta name="description" content="Nudlers" />
      </Head>
      <body>
        <Main />
        <NextScript />
      </body>
    </Html>
  );
} 