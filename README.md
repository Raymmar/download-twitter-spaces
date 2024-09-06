Media Downloader README

Media Downloader - By [Raymmar.com](https://raymmar.com/)

# Download Twitter Spaces audio as an mp3 for free with one click

Get the extension in the Chrome Store: [Coming soon]

I built this extension becaue I often need to download audio from our X.com spaces (Formerly Twitter Spaces) for use in marketing, or to re-purpose the content for other uses. Currently there is no easy way to do this natively on X.com. 

Many of the third party solutions I have found online charge $$ simply to download my own audio and then add a bunch of features I do not need so they can justify the cost. Others solutions are overly technical or are complete scams which take your email and never deliver the audio file. After much frustration I decided to build my own tool. 

## How to use it

There are two ways to use the extension: 

- **Non technical:** Install through the chrome store [coming soon]
- **Technical:** download the files here in GitHub (download a zip file) and then unzip the file, go to [manage chrome extensions](chrome://extensions/) activate developer mode (thre is a switch in the top right corner of this page) and then click on the Load Unpacked Extension button which will only appear if you are in develper mode.

From there you need to locate the (unzipped) file and select it. If you did this correctly you will see a new item in your extension manager dropdown for Media Downloader. 

From there you can pin the extension to make sure it is easily available.

![](https://gateway.ipfs.dxos.network/ipfs/QmR7Eypn85cjsHMLh78nEiVb8FQrQrb3hqHXm82pU7Yrfo)

Once the extension is installed, you will be able to click on the icon to activate it and use it as intended. 

If you try to access Media Downloader on URL's outside of twitter you will get this warning. 

![](https://gateway.ipfs.dxos.network/ipfs/QmX4tdmbTuCb7Bp7uqNW4mAfdwt9hTaibXwBA9XWdkpftC)

To activate the extension you need to be on a Twitter.com or x.com URL and click on the play button of the Twitter Space you want to download. 

The extension will not detect the audio until you start playing the space. 

![](https://gateway.ipfs.dxos.network/ipfs/QmZNBvkx4ZkFm6KJdZjWV8WRMk1WXbH7uL9EUegUXH3qz5)

Once you have started the audio playback on twitter, you will have the option to click the download MP3 button in the extension. 

![](https://gateway.ipfs.dxos.network/ipfs/QmRFS4LnjtdwL3BcqVmYkziuNfoxYMXULTgFmxMyyeyjpY)

From there it will process the file and deliver your mp3 download which you can save directly to your computer. 

## Saving a file

After the file has processed, it will open a save dialogue box on your computer prompting you to save the file. 

![](https://gateway.ipfs.dxos.network/ipfs/QmQg9LtcGLgYphtxCzrYrhVWnyySPWQoNDPTEDD4fwK5nQ)

The filename for the download will pull details from the meta description of the page you are on and include the URL details in case you need to find the post again. Below is an example file name for a file we recently downloaded. 

DXOS on X t.coSFPSZvtQsR.mp3

The extension sanitizes the URL (removes invalid characters like /) so you will need to insert those if you want to access the URL in the future. For instance in the example above to get back to the URL you would need to edit the URL structure to [t.co/SFPSZvtQsR] by inserting the / between the .co and the URL hash on the right. 

You can also just replace this default file name with whatever you want before saving the file. 

## How it works

Twitter obfuscates your audio recordings and then chops them up in to 3 second .acc files which they then combine at runtime to recreate the recording. This makes it difficult to download your audio as you cannot just inspect the page and look for an mp3 file to download. 

This extension works by montors network activity in the browser when activated, and searching for a M3U8 URL which is a playlist that tells the server which .aac files to send back and in what order. 

Once the extension finds that URL, it assembles all of the .aac files, and combines them into a final audio file that you can download as an mp3. 

## Privacy

There is no backend to this extension which means none of your activity passes through a centralized server. This means we can not track your usage or see what you download. This also means we do not store your user sessions or even know what you are doing with the extension. No one does except you and Chrome of course. 

The extension does need certain permissions in the browser to work properly, but be sure that we are not monitoring your web usage, or tracking any of your online behavior. This is one of the reasons I have open sourced the code so that people can know exactly what the extension is doing or even run it locally if you prefer. 

## Roadmap

- Right now the extension only downloads audio files from Twitter spaces. However it could easily be modified to grab audio from other platforms
- I am thinking about adding the ability to download videos from twitter as well as YouTube
- I am also thinking about adding the ability to download YouTube thumbnails with the extension as I often find myself using external services for this as well.
- Maybe this thing could connect to an LLM and spit out a transcript of the twitter space as well?
- I have many other ideas, but who knows what if anything else I will do with it.

You are welcome to fork the repo and buold your own tool with my code as your starting point. If you are interested in helping me improve the extension or have ideas for new features, feel free to reach out or leave a comment here on GitHub. 