/** Tailwind config for Nexus Game Hub.
 *  Mirrors the palette/theme that used to live in the inline CDN config, so the
 *  precompiled stylesheet is a drop-in replacement for cdn.tailwindcss.com. */
module.exports = {
  darkMode: 'class',
  content: ['./index.html', './app.js'],
  theme: {
    extend: {
      colors: {
        nexus: {
          bg:      '#0a0a0f',
          surface: '#12121c',
          card:    '#161623',
          border:  '#25253a',
          cyan:    '#22d3ee',
          violet:  '#8b5cf6',
          green:   '#22c55e',
          red:     '#ef4444',
        },
      },
      fontFamily: {
        display: ['"Segoe UI"', 'system-ui', 'Roboto', 'Helvetica', 'Arial', 'sans-serif'],
      },
      boxShadow: {
        glow:        '0 0 18px -2px rgba(34,211,238,0.55)',
        'glow-soft': '0 0 24px -6px rgba(139,92,246,0.5)',
      },
    },
  },
};
