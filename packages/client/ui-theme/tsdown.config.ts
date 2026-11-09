import { clientBundle } from '../tsdown.client.ts'

export default clientBundle(
  import.meta.dirname,
  ['lib/types/index.js'],
  {
    lib: {
      copy: [
        {
          from: 'src/styles/{brand-font.css,montserrat-*.woff2,Montserrat-OFL.txt}',
          to: 'lib/styles',
        },
        {
          from: 'src/styles/noto-sans-sc.css',
          to: 'lib/styles',
        },
        {
          from: 'src/styles/noto-sans-sc/{*.woff2,NotoSansSC-OFL.txt}',
          to: 'lib/styles/noto-sans-sc',
        },
      ],
    },
  },
)
