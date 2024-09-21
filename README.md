# Download Twitter Spaces for free with one click
With support for video spaces! 

By [Raymmar.com](https://raymmar.com/) & [Atmos](https://atmospr.com/)

- Install the extension on [Chrome](https://chromewebstore.google.com/detail/download-twitter-spaces/hjgpigfbmdlajibmebhndhjiiohodgfi?authuser=0&hl=en)

This extension allows you to download audio and video from x.com Spaces (formerly Twitter) for free,with one click.

## How it works

+ Install the extension
+ Open a twitter/x.com URL with a space recording
+ Start recording playback
+ Activate extension and click download

## How to install this extension locally

If you do not want to install the extension from the chrome web store you can also download the files here in GitHub (download a zip file) and then unzip the file, go to [manage chrome extensions](chrome://extensions/) activate developer mode (there is a switch in the top right corner of this page) and then click on the Load Unpacked Extension button which will only appear while you are in developer mode.

From there you need to locate the (unzipped) file and select it. If you did this correctly you will see a new item in your extension manager dropdown for Twitter Space Downloader. 

From there you should pin the extension to make sure it is easily available.

![](https://gateway.ipfs.dxos.network/ipfs/QmR7Eypn85cjsHMLh78nEiVb8FQrQrb3hqHXm82pU7Yrfo)

## How to use this extension

If you try to access the extension on URL's outside of twitter you will get a warning. 

![](https://gateway.ipfs.dxos.network/ipfs/QmX4tdmbTuCb7Bp7uqNW4mAfdwt9hTaibXwBA9XWdkpftC)

To activate the extension you need to be on a Twitter.com or x.com URL and click on the play button of the Twitter Space you want to download. 
**The extension will not work until you start playing the space.**

![](https://gateway.ipfs.dxos.network/ipfs/QmZNBvkx4ZkFm6KJdZjWV8WRMk1WXbH7uL9EUegUXH3qz5)

Once you have started the space playback, you will have the option to click the download media button. 

![](https://gateway.ipfs.dxos.network/ipfs/QmRFS4LnjtdwL3BcqVmYkziuNfoxYMXULTgFmxMyyeyjpY)

From there it will process the file and deliver your download which can be saved directly to your computer. 

## Saving a file

After the file has been processed, it will open a save dialogue. 

![](https://gateway.ipfs.dxos.network/ipfs/QmQg9LtcGLgYphtxCzrYrhVWnyySPWQoNDPTEDD4fwK5nQ)

You can replace the default file name with whatever you want before saving the file. 

## How it works

Twitter obfuscates your audio / video recordings and then chops them up into short .acc, .ts or .mp4 files which they then combine at runtime to recreate the playback. This makes it difficult to download your audio as you cannot just inspect the page and look for an .mp3 or .mp4 file to download. 

This extension works by monitoring network activity in the browser when activated, and searching for a m3u8 URL which is a playlist that tells the server which files to play and in what order. 

Once the extension finds the m3u8 URL, it assembles all of the files and combines them for download.

## Privacy

There is no backend to this extension which means none of your activity passes through a centralized server. This also means we can not track your usage or see what you download. 

We do not store your sessions or even know what you are doing with the extension. No one does except you and Chrome of course.

The extension does need certain permissions in the browser to work properly, but be sure that we are not monitoring your web usage, or tracking any of your online behavior. This is one of the reasons I have open sourced the code so that people can know exactly what the extension is doing or even run it locally if you prefer. 

## Roadmap

- Right now the extension only downloads audio + video files from Twitter spaces. However it could easily be modified to grab media from other platforms.
- I am thinking about adding the ability to download videos from twitter as well as YouTube.
- I am also thinking about adding the ability to download YouTube thumbnails with the extension as I often find myself using external services for this as well.
- Maybe this thing could connect to an LLM and spit out a transcript of the media as well?
- I have many other ideas, but who knows what I will add.

You are welcome to fork the repo and use my code as your starting point. If you are interested in helping me improve the extension or have ideas for new features, feel free to reach out or leave a comment on GitHub.

