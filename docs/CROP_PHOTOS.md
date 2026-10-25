# Crop photos

Every listing shows, in this order: **the photo the farmer uploaded**, then a **hand-picked photo for the crop**, then a photo from **Pexels** (only if `PEXELS_API_KEY` is set), then the lead photo of the crop's **Wikipedia** article, and last the drawn icon. Automatic photos always show a credit line. Turn the Wikipedia fallback off with `CROP_PHOTO_WIKIPEDIA=false`.

## Replacing a photo you do not like (for example the potato)
1. Find a photo you may use (for example on Wikimedia Commons, which states each photo's licence). Right-click it and copy the image address; it must start with `https://`.
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
Run the same command with `$env:MONGO_URI` set to the Atlas address to fix the live site. New listings pick the override up automatically after the server restarts.

## Removing a listing
```powershell
cd server
npm run delete-listing -- --crop rice --location banglore
```
It shows every match (price, bids, photo type), refuses to delete a listing that has a deal, and waits for you to type `DELETE`.
