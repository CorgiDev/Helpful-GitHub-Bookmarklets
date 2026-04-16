# Helpful GitHub Bookmarklets

An assortment of bookmarklets I made to help with various tasks on GitHub.com.

## Bookmarklet Categories

The following are the categories I have separated the bookmarklets into using folders.

- Comments: These bookmarklets will help with editing / formatting comments.

## Bookmarklets Included

The following contains lists of the bookmarklets in this repo separated into sections based on which category / folder they are contained within.

### Comments

1. `unlink-handles-in-quoted-text.js`
   - Ever quoted someone's reply and had the issue where any handles the original commentor tagged are getting retagged as linked text? This bookmarklet converts those links to inline-code so you are not retagging people you don't intend to. It will not affect any handles you tagged outside the quoted text.
   - 

### Issues

1. `create-offline-issue-copy.js`
   - This bookmarklet allows you to download an offline HTML copy of a GitHub Issue, PR, or Discussion post so that you can access it offline and share it with people who may not have access to view it otherwise.
   - In some cases, the bookmarklet may not be able to download linked media found within the page.
   - In these cases, it will place a box alerting you that the media couldn't be downloaded so you can manually download the media and link it if you wish, or just download it and keep it with the files so it can be easily referenced if needed.
   - You may be asked to provide permission for the folder to be edited. This is just so that the browser can edit the files in the selected folder to save the offline copies.
   - There are multiple versions of this bookmarklet.
   - With all of them, you just copy the script from the JavaScript file and paste it into a bookmark in your browser's bookmark bar.
   - However, the way the one labeled "create-offline-issue-copy-bookmarklet.js" functions is slightly different.
       - Use this version if trying to use the others does not work due to how large the script is
       - This version is shorter because it uses a JSDelivr CDN to grab the script rather than it being contained in the bookmarklet you create in your browser's bookmark bar.
       - Otherwise it functions the same.

## Code Snippets

### create-offline-issue-copy cdn bookmarklet

```js
javascript:(async()=>{const e=new URL("https://cdn.jsdelivr.net/gh/CorgiDev/Helpful-GitHub-Bookmarklets@main/Issues/create-offline-issue-copy/create-offline-issue-copy-standalone.js");try{const t=await fetch(e);if(!t.ok)throw new Error(`Failed to load script (${t.status})`);const r=await t.text(),n=document.createElement("script");n.type="module",n.textContent=r,document.head.appendChild(n)}catch(t){alert(`Error loading bookmarklet: ${t.message}\n\nMake sure the repository is public and try the raw git URL.`)}})();
```
