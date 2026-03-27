export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET');

  const { user_id } = req.query;
  if (!user_id) return res.status(400).json({ error: 'user_id required' });

  const TOKEN = process.env.BOT_TOKEN;

  try {
    // Get user profile photos
    const photosRes = await fetch(`https://api.telegram.org/bot${TOKEN}/getUserProfilePhotos?user_id=${user_id}&limit=1`);
    const photos = await photosRes.json();

    if (!photos.ok || photos.result.total_count === 0) {
      return res.status(404).json({ error: 'no photo' });
    }

    // Get the file_id of the smallest version
    const file_id = photos.result.photos[0][0].file_id;

    // Get file path
    const fileRes = await fetch(`https://api.telegram.org/bot${TOKEN}/getFile?file_id=${file_id}`);
    const file = await fileRes.json();

    const url = `https://api.telegram.org/file/bot${TOKEN}/${file.result.file_path}`;

    // Fetch the image and return it
    const imgRes = await fetch(url);
    const buffer = await imgRes.arrayBuffer();

    res.setHeader('Content-Type', 'image/jpeg');
    res.setHeader('Cache-Control', 'public, max-age=3600');
    return res.send(Buffer.from(buffer));

  } catch (e) {
    return res.status(500).json({ error: e.message });
  }
}
