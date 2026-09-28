# Circub Compass

Know the price before you go. Circub Compass turns community price posts into a plan for your next market trip.

- **Research:** average, lowest and highest prices for the items on your list, the monthly change, and the people who posted each price.
- **Compare by location:** pick any locations and see item and whole-list prices side by side.
- **Plan my budget:** set quantities and a location, and see how much to set aside.

Plain HTML, CSS and JavaScript. No build step and no dependencies.

## Run locally

Open `index.html` in a browser, or serve the folder:

```bash
python3 -m http.server 8000
```

Then visit http://localhost:8000.

## Project layout

```
index.html        page markup
css/style.css     styles (light and dark themes)
js/data.js        sample markets, items and poster names
js/app.js         state, calculations and rendering
```

## Use real data

`js/data.js` holds sample data and `posts()` in `js/app.js` generates sample posts from it. To use real posts, replace `posts(market, item)` so it returns objects shaped like this:

```js
{ item: "Teff", price: 1240, who: "Hana T.", place: "Shema Tera", d: 3, tr: 22 }
// d = days ago, tr = number of posts by that person
```

## License

MIT
