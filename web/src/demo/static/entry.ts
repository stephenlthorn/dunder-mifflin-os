// The static demo's entry (demo.html; `npm run build:demo-static` makes it the index.html of web/dist-demo): start
// the in-browser demo office, point the app's /api calls at it, then start the app as usual.
import { installStaticDemo } from './install';
import { createStaticOffice } from './office';
import { readStaticOptions } from './options';

installStaticDemo(window, createStaticOffice(readStaticOptions(window.location.search)));
void import('../../main');
