# Crop photos

Every listing shows, in this order: **the photo the farmer uploaded**, then a **hand-picked photo for the crop**, then a photo from **Pexels** (only if `PEXELS_API_KEY` is set), then the lead photo of the crop's **Wikipedia** article, and last the drawn icon. Automatic photos always show a credit line. Turn the Wikipedia fallback off with `CROP_PHOTO_WIKIPEDIA=false`.

## Replacing a photo you do not like (for example the potato)
1. Find a photo you may use. **Wikimedia Commons** is the easiest place, because every photo's page states its author and licence (open commons.wikimedia.org and search, for example, "potato"). Open the photo's page, click the picture, then right-click it and choose **Copy image address**.
   - The address must start with `https://` and **end in `.jpg`, `.png` or `.webp`** (Wikimedia ones look like `https://upload.wikimedia.org/.../Potatoes.jpg`). The address of a web page does NOT work: not a shop product page, not a Google or Adobe Stock search page, not a Commons "File:" page. The app ignores those and shows the automatic photo instead.
   - Do not use photos from shops or stock sites (Adobe Stock, Shutterstock, a company's product page) unless you have their permission: they are copyrighted.
   - Write the real author and licence from the photo's page in `credit`. The template text ("Photographer Name, licence") is refused.
2. Put it in `server/data/cropPhotoOverrides.json`, using the crop name in lower case:
```json
{
  "potato": { "url": "https://upload.wikimedia.org/.../Potatoes.jpg", "credit": "Photo: <author>, <licence>" }
}
```
Or choose a different Wikipedia article's lead photo instead of an address: `"potato": { "wikipediaTitle": "<article title>" }`.
3. Apply it to the listings that already exist (own photos uploaded by farmers are never touched):
```powershell
cd server
npm run backfill-images -- --refresh Potato
```
Run the same command with `$env:MONGO_URI` set to the Atlas address to fix the live site.

If a photo disappeared after you edited the file: empty or fix the entry (the simplest is `{}`), restart the server, and run `npm run backfill-images -- --refresh Onion` (and `Potato`) to put the automatic photos back. New listings pick the override up automatically after the server restarts.

## Removing a listing
```powershell
cd server
npm run delete-listing -- --crop rice --location banglore
```
It shows every match (price, bids, photo type), refuses to delete a listing that has a deal, and waits for you to type `DELETE`.
