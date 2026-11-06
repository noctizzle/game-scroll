// Four-shade LCD palettes for the "pocket" games, darkest first.
export const PAL = {
  moss:   ['#0e2611', '#2e5a2b', '#84a83b', '#c6d98c'],
  amber:  ['#2a1405', '#7a3d0c', '#d98a1f', '#ffd98a'],
  ice:    ['#0b1a2e', '#24507a', '#5fa3d0', '#cdeaf7'],
  mono:   ['#16161a', '#4a4a52', '#9a9aa3', '#e4e4e8'],
  rose:   ['#2a0a1c', '#6e1f4a', '#d0608f', '#f7d0e0'],
  mint:   ['#082320', '#1d5c52', '#4fb39c', '#cff2e6'],
  // colour-era games draw in full colour; these four set the start/game-over screen and shell
  berry:  ['#1c0b2e', '#5b2a86', '#c86bd8', '#f6e3ff'],
  grape:  ['#120f2b', '#3b3a8f', '#7f8cff', '#e4e8ff'],
  teal:   ['#06201f', '#0f5f5c', '#2fc0b0', '#d6fff6'],
  lemon:  ['#2a2006', '#7a5c0c', '#e8c13a', '#fff6c8'],
};
// Handheld shell colours that pair with each palette.
export const SHELL = {
  moss: '#cdc8bc', amber: '#3a3d46', ice: '#e6e8ec', mono: '#b9b4ab', rose: '#2f2a3a', mint: '#d9d2c3',
  berry: '#8a3fb0', grape: '#4d4aa8', teal: '#1f9a90', lemon: '#e0b92a',
};

// Bright colours for colour-era pocket games (black, white, then a 16-colour set).
export const C16 = ['#101018', '#f8f8f0', '#e04040', '#f08830', '#f8d838', '#58c040', '#208858', '#38b8e8', '#3858d8', '#8848c8', '#e868b8', '#a86838', '#683820', '#888898', '#c8c8d0', '#284028'];
