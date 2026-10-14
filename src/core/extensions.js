// What each file extension is. One place to extend: add an extension to its
// category and every part of Tembo (plan, folders, series) picks it up.
// .exe and .html are not here: their content decides (see rules.js).

module.exports = {
  Documents: [
    '.pdf', '.doc', '.docx', '.docm', '.odt', '.rtf', '.txt', '.md', '.log', '.tex',
    '.epub', '.mobi', '.azw3', '.fb2', '.djvu', '.xps', '.oxps', '.pages',
  ],
  Spreadsheets: ['.xls', '.xlsx', '.xlsm', '.ods', '.csv', '.tsv', '.numbers'],
  Presentations: ['.ppt', '.pptx', '.pps', '.ppsx', '.odp', '.key'],

  Images: [
    '.jpg', '.jpeg', '.jfif', '.png', '.gif', '.webp', '.avif', '.heic', '.heif', '.bmp',
    '.tif', '.tiff', '.svg', '.ico', '.raw', '.cr2', '.cr3', '.nef', '.arw', '.dng', '.tga',
    '.dds', '.exr', '.hdr',
  ],
  // Layered and editable artwork: the source files of pictures.
  Design: [
    '.psd', '.psb', '.kra', '.xcf', '.pdn', '.paint', '.ai', '.eps', '.cdr', '.fig', '.sketch',
    '.xd', '.ase', '.aseprite', '.clip', '.sai', '.sai2', '.procreate', '.afphoto', '.afdesign',
    '.pxd', '.drawio',
  ],
  Models3D: [
    '.blend', '.blend1', '.fbx', '.obj', '.mtl', '.glb', '.gltf', '.stl', '.3mf', '.dae',
    '.3ds', '.max', '.ma', '.mb', '.c4d', '.usd', '.usdz', '.ply', '.vox', '.spp', '.ztl',
  ],

  Videos: [
    '.mp4', '.mov', '.mkv', '.avi', '.webm', '.wmv', '.m4v', '.flv', '.3gp', '.mts', '.m2ts',
    '.vob', '.mpg', '.mpeg', '.srt', '.ass', '.vtt',
  ],
  Audio: [
    '.mp3', '.wav', '.flac', '.aac', '.ogg', '.oga', '.m4a', '.wma', '.opus', '.aiff', '.aif',
    '.amr', '.ape', '.wv',
  ],
  // DAW projects, presets, MIDI, samplers and plugins: FL Studio, Ableton,
  // Serum, Vital and friends.
  AudioProjects: [
    '.flp', '.fst', '.fsc', '.zgp', '.fxp', '.fxb', '.nmsv', '.serum', '.serumpreset',
    '.serumpack', '.vital', '.vitalbank', '.vitalskin', '.h2p', '.ksd', '.nki', '.nkm', '.nkx',
    '.sf2', '.sfz', '.als', '.alp', '.adg', '.adv', '.agr', '.rpp', '.cpr', '.ptx', '.logicx',
    '.band', '.aup', '.aup3', '.mid', '.midi', '.mscz', '.gp', '.gpx', '.gp5', '.vst3',
    '.clap', '.component', '.fxpreset', '.vstpreset',
  ],

  // Things you run.
  Scripts: [
    '.ahk', '.ah2', '.au3', '.bat', '.cmd', '.ps1', '.psm1', '.vbs', '.vbe', '.wsf',
    '.sh', '.py', '.pyw', '.reg', '.lua',
  ],
  // Source code and configuration.
  Code: [
    '.js', '.ts', '.tsx', '.jsx', '.mjs', '.cjs', '.css', '.scss', '.json', '.jsonc', '.xml', '.yaml',
    '.yml', '.toml', '.ini', '.cfg', '.conf', '.env', '.java', '.kt', '.c', '.h', '.cpp', '.hpp',
    '.cs', '.go', '.rs', '.rb', '.php', '.swift', '.dart', '.gd', '.gdshader', '.tscn', '.tres',
    '.shader', '.hlsl', '.glsl', '.sql', '.ipynb', '.vue', '.svelte',
  ],

  Archives: [
    '.zip', '.rar', '.7z', '.tar', '.gz', '.tgz', '.bz2', '.xz', '.zst', '.lz', '.lzma', '.cab',
  ],
  Installers: [
    '.msi', '.msix', '.appx', '.msixbundle', '.appxbundle', '.dmg', '.pkg', '.deb', '.rpm',
    '.apk', '.xapk', '.apks',
  ],
  // Portable apps that are not .exe: Java apps, Minecraft mods and launchers.
  Programs: ['.jar', '.appimage'],
  DiskImages: ['.iso', '.img', '.vhd', '.vhdx', '.vmdk', '.cue', '.nrg'],
  Fonts: ['.ttf', '.otf', '.ttc', '.woff', '.woff2', '.fon'],
  Torrents: ['.torrent'],
};
