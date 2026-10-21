#!/usr/bin/env node
// sticker logos as SVG (and PNG): heavy letters, a round outline, a solid extrusion. Everything comes from a JSON config,
// so a person or an agent makes a new version by editing data, never this file. `node logo.mjs --help` for the flags.
import { createRequire } from 'node:module';
import fs from 'node:fs';
import path from 'node:path';
import { parseArgs } from 'node:util';
import opentype from 'opentype.js';

const HELP = `sticker-logo: sticker logos as SVG (and PNG) from a JSON config

Usage:
  node logo.mjs [options]

Options:
  -c, --config <file>   config file (default: logo.config.json)
  -t, --text <text>     quick mode: one inline logo of this text, plus a stacked one (one word per line)
  -l, --logo <names>    only these logos, comma separated
      --theme <names>   only these themes, comma separated
  -a, --align <align>   line alignment for every logo: left, center, right or stagger (overrides style.align)
  -o, --out <dir>       output folder (overrides output.dir)
      --png <sizes>     also write PNGs at these widths, comma separated (needs @resvg/resvg-js)
      --list            print the logos and themes in the config, write nothing
  -h, --help            this help

Every file written is listed in <out>/manifest.json; <out>/preview.html shows them all.`;

// what a config may leave out
const DEFAULTS = {
	name: 'logo',
	font: { fontsource: 'inter', weight: 900 },
	style: {
		size: 190,
		tracking: -9,
		wordSpacing: 30,
		lineHeight: 158,
		align: 'stagger',
		indent: 60,
		outline: 26,
		extrusion: { depth: 30, direction: 'down-left', step: 1.5 },
		fillGaps: true,
	},
	themes: {
		light: { background: '#FFFFFF', ink: '#09090B', fill: '#FFFFFF' },
	},
	logos: [],
	output: { dir: 'out', background: true, transparent: true, padding: 70, png: [] },
};

const DIRECTIONS = { 'down-left': [-1, 1], 'down-right': [1, 1], 'up-left': [-1, -1], 'up-right': [1, -1], down: [0, 1], left: [-1, 0], right: [1, 0], up: [0, -1] };

const fail = message => {
	console.error(`sticker-logo: ${message}`);
	process.exit(1);
};

const isObject = v => v !== null && typeof v === 'object' && !Array.isArray(v);

// objects merge key by key; arrays and values replace
const merge = (base, over) => {
	if (!isObject(base) || !isObject(over)) {
		return over === undefined ? base : over;
	}
	const out = { ...base };
	for (const [k, v] of Object.entries(over)) {
		out[k] = merge(base[k], v);
	}
	return out;
};

const fonts = new Map();

// a font file (.ttf, .otf or .woff; not .woff2), or a @fontsource package by name and weight
const loadFont = (font, baseDir) => {
	let file;
	if (font.file) {
		file = path.resolve(baseDir, font.file);
	} else if (font.fontsource) {
		const pkg = `@fontsource/${font.fontsource}`;
		let dir;
		for (const from of [baseDir, process.cwd(), import.meta.dirname ?? path.dirname(new URL(import.meta.url).pathname)]) {
			try {
				dir = path.dirname(createRequire(path.join(from, 'x.js')).resolve(`${pkg}/package.json`));
				break;
			} catch {
				// not installed next to this folder; try the next one
			}
		}
		if (!dir) {
			fail(`font package ${pkg} is not installed. Run: npm install ${pkg}`);
		}
		file = path.join(dir, 'files', `${font.fontsource}-${font.subset ?? 'latin'}-${font.weight ?? 400}-${font.style ?? 'normal'}.woff`);
	} else {
		fail('font needs "file" or "fontsource"');
	}
	if (!fs.existsSync(file)) {
		fail(`font file not found: ${file}${font.fontsource ? ` (is weight ${font.weight} published for ${font.fontsource}?)` : ''}`);
	}
	if (!fonts.has(file)) {
		const buffer = fs.readFileSync(file);
		fonts.set(file, opentype.parse(buffer.buffer.slice(buffer.byteOffset, buffer.byteOffset + buffer.byteLength)));
	}
	return fonts.get(file);
};

// one line of text as glyph outlines: tracking between letters, wordSpacing in place of a space
const setLine = (font, text, x0, y, s) => {
	const scale = s.size / font.unitsPerEm;
	const out = new opentype.Path();
	let x = x0;
	const words = text.split(/\s+/).filter(Boolean);
	words.forEach((word, w) => {
		const glyphs = font.stringToGlyphs(word);
		glyphs.forEach((g, i) => {
			out.extend(g.getPath(x, y, s.size));
			x += g.advanceWidth * scale;
			if (i < glyphs.length - 1) {
				x += font.getKerningValue(g, glyphs[i + 1]) * scale + s.tracking;
			}
		});
		if (w < words.length - 1) {
			x += s.wordSpacing;
		}
	});
	return { path: out, start: x0, end: x, y };
};

const rect = (x1, y1, x2, y2) => {
	const p = new opentype.Path();
	p.moveTo(x1, y1);
	p.lineTo(x2, y1);
	p.lineTo(x2, y2);
	p.lineTo(x1, y2);
	p.close();
	return p;
};

// a logo's letters, and the ink under them: the letters plus, between stacked lines, a band so no background shows there
const ALIGNS = ['left', 'center', 'right', 'stagger'];

// lines are first set at x 0 to measure them, then placed by `align`: flush left, centred, flush right, or staggered
// (line i starts i × indent further right). A line's own `x` wins over the alignment.
const layout = (logo, font, s) => {
	if (!ALIGNS.includes(s.align)) {
		fail(`style.align must be one of ${ALIGNS.join(', ')}, got ${JSON.stringify(s.align)}`);
	}
	const specs = logo.lines.map(line => (typeof line === 'string' ? { text: line } : line));
	const widths = specs.map(l => setLine(font, l.text, 0, 0, s).end);
	const widest = Math.max(...widths);
	const lines = specs.map((l, i) => {
		const x = { left: 0, center: (widest - widths[i]) / 2, right: widest - widths[i], stagger: i * s.indent }[s.align];
		return setLine(font, l.text, l.x ?? x, l.y ?? i * s.lineHeight, s);
	});
	const letters = new opentype.Path();
	lines.forEach(l => letters.extend(l.path));
	const ink = new opentype.Path();
	ink.extend(letters);
	if (s.fillGaps) {
		for (let i = 1; i < lines.length; i++) {
			const a = lines[i - 1], b = lines[i];
			const x1 = Math.max(a.start, b.start) + s.size * 0.16, x2 = Math.min(a.end, b.end) - s.size * 0.16;
			if (x2 > x1) {
				ink.extend(rect(x1, a.y - s.size * 0.16, x2, b.y - s.size * 0.5));
			}
		}
	}
	return { letters, ink };
};

const direction = d => {
	if (Array.isArray(d)) {
		const len = Math.hypot(d[0], d[1]) || 1;
		return [d[0] / len, d[1] / len];
	}
	const v = DIRECTIONS[d];
	if (!v) {
		fail(`extrusion.direction must be one of ${Object.keys(DIRECTIONS).join(', ')} or [dx, dy], got ${JSON.stringify(d)}`);
	}
	const len = Math.hypot(v[0], v[1]);
	return [v[0] / len, v[1] / len];
};

const n = v => +v.toFixed(1);

// the SVG: the ink stroked and copied step by step along the extrusion, then the letters on top
const render = ({ letters, ink }, s, theme, { background, padding, square }) => {
	const [ux, uy] = direction(s.extrusion.direction);
	const depth = s.extrusion.depth, step = Math.max(0.25, s.extrusion.step);
	const bb = ink.getBoundingBox(), r = s.outline / 2;
	const dx = ux * depth, dy = uy * depth;
	const x1 = bb.x1 - r + Math.min(0, dx), y1 = bb.y1 - r + Math.min(0, dy);
	const x2 = bb.x2 + r + Math.max(0, dx), y2 = bb.y2 + r + Math.max(0, dy);
	let w = x2 - x1 + padding * 2, h = y2 - y1 + padding * 2;
	if (square) {
		w = h = Math.max(w, h);
	}
	const vx = x1 - (w - (x2 - x1)) / 2, vy = y1 - (h - (y2 - y1)) / 2;
	const copies = [];
	for (let t = depth; t > 0; t -= step) {
		copies.push(`<use href="#ink" transform="translate(${n(ux * t)} ${n(uy * t)})"/>`);
	}
	return [
		`<svg xmlns="http://www.w3.org/2000/svg" viewBox="${n(vx)} ${n(vy)} ${n(w)} ${n(h)}" width="${n(w)}" height="${n(h)}">`,
		background ? `<rect x="${n(vx)}" y="${n(vy)}" width="${n(w)}" height="${n(h)}" fill="${theme.background}"/>` : '',
		`<defs><path id="ink" d="${ink.toPathData(1)}" fill="${theme.ink}" stroke="${theme.ink}" stroke-width="${s.outline}" stroke-linejoin="round"/></defs>`,
		copies.join(''),
		`<use href="#ink"/>`,
		`<path d="${letters.toPathData(1)}" fill="${theme.fill}"/>`,
		'</svg>',
	].join('');
};

const check = (cfg, file) => {
	if (!Array.isArray(cfg.logos) || !cfg.logos.length) {
		fail(`${file}: "logos" must list at least one logo`);
	}
	cfg.logos.forEach((l, i) => {
		if (!l.name || !Array.isArray(l.lines) || !l.lines.length) {
			fail(`${file}: logos[${i}] needs "name" and a non-empty "lines"`);
		}
	});
	if (!isObject(cfg.themes) || !Object.keys(cfg.themes).length) {
		fail(`${file}: "themes" must have at least one theme`);
	}
	for (const [k, t] of Object.entries(cfg.themes)) {
		for (const key of ['background', 'ink', 'fill']) {
			if (typeof t[key] !== 'string') {
				fail(`${file}: themes.${k}.${key} must be a colour string`);
			}
		}
	}
};

const main = async () => {
	const { values: opt } = parseArgs({
		options: {
			config: { type: 'string', short: 'c' },
			text: { type: 'string', short: 't' },
			logo: { type: 'string', short: 'l' },
			theme: { type: 'string' },
			align: { type: 'string', short: 'a' },
			out: { type: 'string', short: 'o' },
			png: { type: 'string' },
			list: { type: 'boolean' },
			help: { type: 'boolean', short: 'h' },
		},
	});
	if (opt.help) {
		console.log(HELP);
		return;
	}

	const file = path.resolve(opt.config ?? 'logo.config.json');
	let user = {};
	if (fs.existsSync(file)) {
		try {
			user = JSON.parse(fs.readFileSync(file, 'utf8'));
		} catch (e) {
			fail(`${file} is not valid JSON: ${e.message}`);
		}
	} else if (opt.config || !opt.text) {
		fail(`config not found: ${file} (pass --config, or --text for a quick logo)`);
	}
	const baseDir = path.dirname(file);
	const cfg = merge(DEFAULTS, user);
	// a config's themes replace the default one rather than adding to it
	if (isObject(user.themes)) {
		cfg.themes = user.themes;
	}
	if (opt.text) {
		const words = opt.text.trim().split(/\s+/);
		cfg.name = words.join('-').toLowerCase().replace(/[^a-z0-9-]/g, '') || 'logo';
		cfg.logos = [{ name: 'inline', lines: [opt.text] }, ...(words.length > 1 ? [{ name: 'stacked', lines: words, square: true }] : [])];
	}
	if (opt.align) {
		cfg.style.align = opt.align;
		cfg.logos = cfg.logos.map(l => (l.style?.align ? { ...l, style: { ...l.style, align: opt.align } } : l));
	}
	check(cfg, file);

	const pick = (list, names, what) => {
		if (!names) {
			return list;
		}
		const want = names.split(',').map(x => x.trim());
		const unknown = want.filter(w => !list.some(([k]) => k === w));
		if (unknown.length) {
			fail(`unknown ${what}: ${unknown.join(', ')} (have: ${list.map(([k]) => k).join(', ')})`);
		}
		return list.filter(([k]) => want.includes(k));
	};
	const logos = pick(cfg.logos.map(l => [l.name, l]), opt.logo, 'logo');
	const themes = pick(Object.entries(cfg.themes), opt.theme, 'theme');

	if (opt.list) {
		console.log(`logos:  ${cfg.logos.map(l => `${l.name} (${l.lines.map(x => (typeof x === 'string' ? x : x.text)).join(' / ')})`).join(', ')}`);
		console.log(`themes: ${Object.keys(cfg.themes).join(', ')}`);
		return;
	}

	const out = path.resolve(opt.out ? process.cwd() : baseDir, opt.out ?? cfg.output.dir);
	fs.mkdirSync(out, { recursive: true });
	const pngSizes = opt.png ? opt.png.split(',').map(Number).filter(x => x > 0) : cfg.output.png;
	let Resvg;
	if (pngSizes.length) {
		try {
			({ Resvg } = await import('@resvg/resvg-js'));
		} catch {
			fail('PNG output needs @resvg/resvg-js: npm install @resvg/resvg-js');
		}
	}

	const written = [];
	const write = (name, data, meta) => {
		fs.writeFileSync(path.join(out, name), data);
		written.push({ file: name, ...meta });
	};
	for (const [, logo] of logos) {
		const s = merge(cfg.style, logo.style ?? {});
		const font = loadFont(merge(cfg.font, logo.font ?? {}), baseDir);
		const shapes = layout(logo, font, s);
		for (const [themeName, theme] of themes) {
			const variants = [];
			if (cfg.output.background) {
				variants.push({ suffix: '', background: true, padding: logo.padding ?? cfg.output.padding, square: !!logo.square });
			}
			if (cfg.output.transparent) {
				variants.push({ suffix: '-transparent', background: false, padding: 0, square: false });
			}
			for (const v of variants) {
				const base = `${cfg.name}-${logo.name}-${themeName}${v.suffix}`;
				const svg = render(shapes, s, theme, v);
				const meta = { logo: logo.name, theme: themeName, background: v.background };
				write(`${base}.svg`, svg, { ...meta, format: 'svg' });
				for (const size of pngSizes) {
					const png = new Resvg(svg, { fitTo: { mode: 'width', value: size } }).render().asPng();
					write(`${base}@${size}.png`, png, { ...meta, format: 'png', width: size });
				}
			}
		}
	}

	const svgs = written.filter(f => f.format === 'svg');
	fs.writeFileSync(path.join(out, 'manifest.json'), JSON.stringify({ name: cfg.name, files: written }, null, '\t') + '\n');
	fs.writeFileSync(
		path.join(out, 'preview.html'),
		`<!doctype html><meta charset="utf-8"><title>${cfg.name}</title><style>body{margin:0;font:13px system-ui;background:#888}figure{margin:0;display:inline-block;vertical-align:top}figcaption{padding:4px 8px;color:#fff}img{display:block;max-width:480px;max-height:300px;background:repeating-conic-gradient(#ccc 0 25%,#eee 0 50%) 0 0/16px 16px}</style>` +
			svgs.map(f => `<figure><img src="${f.file}"><figcaption>${f.file}</figcaption></figure>`).join('')
	);
	console.log(`${written.length} files in ${path.relative(process.cwd(), out) || '.'} (manifest.json, preview.html)`);
};

main();
