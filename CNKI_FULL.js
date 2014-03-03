{
        "translatorID":"7ed3046f-bf62-45f3-8002-487b56717a30",
        "label":"CNKI_FULL",
        "creator":"Alwin Tsui <alwintsui@gmail.com>",
        "target":"^https?://(?:(?:(dlib|epub|acad|apj1|law1|www)\\.cnki\\.net)|(?:[0-9\\.]+))/(?:grid2008|kns50|Kns55|kcms)",
        "minVersion":"2.0rc1",
        "maxVersion":"",
        "priority":100,
        "inRepository":"1",
        "translatorType":4,
        "lastUpdated":"2011-03-24 14:12:00"
}

/*
   CNKI(China National Knowledge Infrastructure) Translator
   Copyright (C) 2009-2010 Alwin Tsui <alwintsui@gmail.com>
   Modified from CNKI.js by TAO Cheng, acestrong@gmail.com
   
   This program is free software: you can redistribute it and/or modify
   it under the terms of the GNU General Public License as published by
   the Free Software Foundation, either version 3 of the License, or
   (at your option) any later version.
   This program is distributed in the hope that it will be useful,
   but WITHOUT ANY WARRANTY; without even the implied warranty of
   MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.  See the
   GNU General Public License for more details.
   You should have received a copy of the GNU General Public License
   along with this program.  If not, see <http://www.gnu.org/licenses/>.

 * Features
 *
 *   - 可识别单一和联合数据库搜索
 *   - 支持单篇和多篇下载
 *   - 异步方式下载，速度更快
 *   - 支持所有五种类型的文章：期刊，辑刊，会议，报纸和学位论文
 * TODO
 *   -异步多篇下载时，可能会丢失几篇没下载
 */
//已经测试 http://epub.cnki.net/grid2008/index/ZKCALD.htm

// #####Zetero API##########
function detectWeb(doc, url) 
{
    Zotero.debug(url);
    var pattern = /detail.aspx/;
    if (pattern.test(url)) {
        return 'journalArticle';
    }
    pattern = /brief/;
    if (pattern.test(url)) {
        return "multiple";
    }
    return false;
}
function doWeb(doc, url) 
{
    var nsResolver = getResolver(doc);
    var arts = new Array();
    if (detectWeb(doc, url) == "multiple") 
    {
        var items = new Object();
        var iframe = doc.evaluate('//iframe[@id="iframeResult"]', doc, nsResolver, XPathResult.ANY_TYPE, 
        null).iterateNext();
        if (iframe) {
            //Zotero.debug(iframe.src);
            content = Zotero.Utilities.retrieveSource(iframe.src);
        }
        else {
            //Zotero.debug(url);
            content = Zotero.Utilities.retrieveSource(url);
        }
        var pattern = /<a .*?href=["'](.*?\/detailj?\.aspx.*?)["'][^>]*?>([^\d].*?)<\/a>/g;
        //Zotero.debug(content);
        res = pattern.exec(content);
        var link, title, patt;
        while (res) 
        {
            title = Zotero.Utilities.cleanTags(res[2]);
            if (title.length != 0) 
            {
                if (title.match('document.write')) 
                {
                    tiltrim = /.*?document\.write.*?["'](.*?)["']/;
                    title = tiltrim.exec(title)[1];
                    // 替换js标题
                }
                link = res[1];
                patt = /^(http:\/\/.*?)\//;
                //提取http://../形式，添加一个http头
                link = patt.exec(url)[1] + link;
                items[link] = trimTags(title);
            }
            res = pattern.exec(content);
        }
        //Zotero.debug(items);
        if (items.__count__) 
        {
            // 弹出列表窗口，让用户选择要保存哪些文献
            items = Zotero.selectItems(items);
            if (!items) {
                return true;
            }
            for (var url in items) {
                arts.push(url);
            }
        }
    }
    else {
        arts = [url];
    }
    //Zotero.debug(arts);
    /*
    var page;
    for (var i in arts){
        Zotero.debug(arts[i]);
       page = Zotero.Utilities.retrieveSource(arts[i]);
       scrape(page, arts[i]) ;
    }
    */
    Zotero.Utilities.HTTP.doGet(arts, scrape, function () 
    {
        Zotero.done();
        //异步方式
    });
    Zotero.wait();
}
// #####LOCAL API##########
function getResolver(doc) 
{
    var namespace = doc.documentElement.namespaceURI;
    var nsResolver = namespace ? function (prefix) 
    {
        if (prefix == 'x') {
            return namespace;
        }
        else {
            return null;
        }
    }
     : null;
    return nsResolver;
}
function trimTags(text) 
{
    return text ? text.replace( /(<.*?>)/g, "") : text;
}
function trimMultiline(text) 
{
    return text ? text.replace( /(\s{2,})/g, "\n") : text;
}
// #############################
// ##### Scraper functions #####
// #############################
function scrape(text, httpxml, url) 
{
    var dbname;
    var pattern = /<title>([\s\S]*?)<\/title>/g;
    var title = pattern.exec(text);
    if (title) {
        dbname = title[1].split("-")[1];
        dbname = dbname.replace(/^\s*|\s*$/g, '');
    }
    else {
        return;
    }
    //Zotero.debug(url);
    if (dbname.match("期刊") || dbname.match("辑刊")) {
        scrapeAndParse1(url, text);
    }

    else if (dbname.match("学位论文")) {
        scrapeAndParse2(url, text, dbname) ;
    }
    else if (dbname.match("会议")) {
        scrapeAndParse3(url, text) ;
    }
    else if (dbname.match("报纸")) {
        scrapeAndParse4(url, text) ;
    }
}

// work for journalArticle
function scrapeAndParse1(url, page) 
{
    //      Zotero.debug("journalArticle");
    //  Zotero.debug(url);
    //Zotero.debug(page);
    var pattern;
    // 类型 & URL
    var itemType = "journalArticle";
    var newItem = new Zotero.Item(itemType);
    //              Zotero.debug(url);
    newItem.url = url;
    // 标题/Title
    pattern = /<span (?:id=["']chTitle["']|id=["']enTitle["']|class=["']datatitle["'])>(.*?)<\/span>/;
    //pattern = /<span .*?chTitle|datatitle.*?>(.*?)<\/span>/;
    if (pattern.test(page)) 
    {
        var title = trimTags(pattern.exec(page)[1]);
        newItem.title = title;
        Zotero.debug("title: "+title);
    }
    // 作者/Authors
    var authorNames;
    pattern = /【作者】(?:[\s\S]*?)GetLinkListEx\('(.*?);','/;
    if (pattern.test(page)) {
        authorNames = pattern.exec(page)[1].split(";");
    }
    else 
    {
        pattern = /【作者】([\s\S]*?)<\/tr>/;
        if (pattern.test(page)) {
            authorNames = trimTags(pattern.exec(page)[1]).split(";");
        }
    }
    if (authorNames) 
    {
        for (var i = 0; i < authorNames.length; i++) 
        {
            var authorName = Zotero.Utilities.trim(authorNames[i]);
            if (authorName.length > 0) 
            {
                newItem.creators.push( Zotero.Utilities.cleanAuthor(authorNames[i], "author", true));
            }
        }
        //                      Zotero.debug("authorNames:\n"+authorNames);
    }
    // update for new web
    pattern = /【作者】([\s\S]*?)<\/p>/;
    if (pattern.test(page)) 
    {
        var authorNames = Zotero.Utilities.trimInternal(trimTags(pattern.exec(page)[1])).split("；");
        for (var i = 0; i < authorNames.length; i++) 
        {
            if (authorNames[i]) 
            {
                newItem.creators.push( Zotero.Utilities.cleanAuthor(authorNames[i], "author", true));
            }
        }
        //                      Zotero.debug("authorNames:\n"+authorNames);
    }
    pattern = /【Author】(.*?)<\/p>/;
    if (pattern.test(page)) 
    {
        var authorNames = Zotero.Utilities.trimInternal(trimTags(pattern.exec(page)[1])).split(",");
        for (var i = 0; i < authorNames.length; i++) 
        {
            if (authorNames[i]) 
            {
                newItem.creators.push( Zotero.Utilities.cleanAuthor(authorNames[i], "author", true));
            }
        }
        //                      Zotero.debug("authorNames:\n"+authorNames);
    }

    // 摘要/Abstract
    var abst;
    pattern = /【摘要】\s*<[^>]*>(.*?)<\/span>/;
    if (pattern.test(page)) {
        abst = trimTags(pattern.exec(page)[1]);
    }
    else 
    {
        pattern = /【摘要】([\s\S]*?)<\/tr>/;
        if (pattern.test(page)) {
            abst = trimTags(pattern.exec(page)[1]);
        }
    }
    if (abst) 
    {
        //                      Zotero.debug("abstract:\n"+abst);
        newItem.abstractNote = Zotero.Utilities.trim(abst);
    }
    pattern = /【Abstract】\s*<[^>]*>(.*?)<\/span>/;
    if (pattern.test(page)) {
        abst = trimTags(pattern.exec(page)[1]);
    }
    else 
    {
        pattern = /【英文摘要】([\s\S]*?)<\/tr>/;
        if (pattern.test(page)) {
            abst = trimTags(pattern.exec(page)[1]);
        }
    }
    if (abst) 
    {
        //                      Zotero.debug("abstract:\n"+abst);
        if (newItem.abstractNote === undefined) {
            newItem.abstractNote = Zotero.Utilities.trim(abst);
        }
        else {
            newItem.abstractNote = newItem.abstractNote + "\n" + Zotero.Utilities.trim(abst);
        }
    }
    //              Zotero.debug(newItem.abstractNote);
    // 关键词/Keywords
    var tags;
    pattern = /【关键词】(?:[\s\S]*?)KeywordFilter\('(.*?)'\),'kw'/;
    if (pattern.test(page)) {
        tags = pattern.exec(page)[1].split(";");
    }
    else 
    {
        pattern = /【(?:中文)?关键词】([\s\S]*?)<\/tr>/;
        if (pattern.test(page)) {
            tags = trimTags(pattern.exec(page)[1]).split(";");
        }
    }
    if (tags) 
    {
        for (var i = 0; i < tags.length; i++) 
        {
            var tag = Zotero.Utilities.trim(tags[i]);
            if (tag.length > 0 && newItem.tags.indexOf(tag) < 0) {
                newItem.tags.push(tag);
            }
        }
        //                      Zotero.debug("tags:\n"+tags);
    }
    pattern = /【Key words】(?:[\s\S]*?)GetLinkList\('(.*?)','kw'/;
    if (pattern.test(page)) {
        tags = pattern.exec(page)[1].split(";");
    }
    else 
    {
        pattern = /【英文关键词】([\s\S]*?)<\/tr>/;
        if (pattern.test(page)) {
            tags = trimTags(pattern.exec(page)[1]).split(";");
        }
    }
    if (tags) 
    {
        for (var i = 0; i < tags.length; i++) 
        {
            var tag = Zotero.Utilities.trim(tags[i]);
            if (tag.length > 0 && newItem.tags.indexOf(tag) < 0) {
                newItem.tags.push(tag);
            }
        }
        //                      Zotero.debug("tags:\n"+tags);
    }
    // 文献出处 & DOI & 出版时间
    pattern = /【(?:文献出处|刊名)】([\s\S]*?)<\/a>/;
    if (pattern.test(page)) 
    {
        var publicationTitle = trimTags(pattern.exec(page)[1]);
        newItem.publicationTitle = Zotero.Utilities.trim(publicationTitle);
        //                      Zotero.debug("publicationTitle: "+publicationTitle);
    }
    var doi;
    pattern = /【DOI】(.*?)<\/li>/;
    if (pattern.test(page)) {
        doi = pattern.exec(page)[1];
    }
    else 
    {
        pattern = /【DOI】([\s\S]*?)<\/tr>/;
        if (pattern.test(page)) {
            doi = trimTags(pattern.exec(page)[1]);
        }
    }
    if (doi) {
        newItem.DOI = Zotero.Utilities.trim(doi);
        //                      Zotero.debug("doi: "+doi);
    }
    pattern = /【(?:文献出处|刊名)】(?:[\s\S]*?)(\d{4})年\s*([0-9A-Z]{2})(卷|期)/;
    if (pattern.test(page)) 
    {
        var date = pattern.exec(page)[1];
        newItem.date = date;
        var val = pattern.exec(page)[2];
        var attr = pattern.exec(page)[3];
        if (attr == "卷") {
            newItem.volume = val;
        }
        else {
            newItem.issue = val;
        }
        //                      Zotero.debug("date: "+date);
        //                      Zotero.debug("val: "+val);
        //                  Zotero.debug("attr: "+attr);
    }
    newItem.complete();
}
// work for thesis
function scrapeAndParse2(url, page, thesisDB) 
{
    //   Zotero.debug(page);
    var pattern;
    // 类型 & URL
    var itemType = "thesis";
    var newItem = new Zotero.Item(itemType);
    //              Zotero.debug(url);
    newItem.url = url;
    if (thesisDB.match("博士")) {
        newItem.thesisType = "博士论文" 
    }
    else {
        newItem.thesisType = "硕士论文" 
    }
    //              Zotero.debug(newItem.thesisType);
    // 标题/Title
    pattern = /<span (?:id=["']chTitle["']|class=["']datatitle["'])>(.*?)<\/span>/;
    if (pattern.test(page)) 
    {
        var title = pattern.exec(page)[1];
        pattern = /(<.*?>)/g;
        title = title.replace(pattern, "");
        newItem.title = title;
        //                      Zotero.debug("title: "+title);
    }
    // 作者/Author
    pattern = /【作者】([\s\S]*?)<\/a>/;
    if (pattern.test(page)) 
    {
        var authorNames = trimTags(pattern.exec(page)[1]).split(";");
        for (var i = 0; i < authorNames.length; i++) 
        {
            newItem.creators.push( Zotero.Utilities.cleanAuthor(authorNames[i], "author", true));
        }
        //                      Zotero.debug("authorNames:\n"+authorNames);
    }
    // 导师/Tutors
    pattern = /【导师】([\s\S]*?)<\/a>/;
    if (pattern.test(page)) 
    {
        var directors = trimTags(pattern.exec(page)[1]).split(";");
        for (var i = 0; i < directors.length; i++) 
        {
            newItem.creators.push( Zotero.Utilities.cleanAuthor(trimTags(directors[i]), "director", true));
        }
        //                      Zotero.debug("directors: "+directors);
    }
    // 摘要/Abstract
    var abst;
    pattern = /ReplaceFont\('ChDivSummary','(.*?)(?='\);ReplaceFont)/;
    if (pattern.test(page)) {
        abst = trimTags(pattern.exec(page)[1]);
    }
    else 
    {
        pattern = /【中文摘要】([\s\S]*?)<\/tr>/;
        if (pattern.test(page)) {
            abst = trimTags(pattern.exec(page)[1]);
        }
    }
    if (abst) {
        //                      Zotero.debug("abstract:\n"+abst);
        newItem.abstractNote = trimMultiline(abst);
    }
    pattern = /ReplaceFont\('EnDivSummary','(.*?)(?='\);if)/;
    if (pattern.test(page)) {
        abst = trimTags(pattern.exec(page)[1]);
    }
    else 
    {
        pattern = /【英文摘要】([\s\S]*?)<\/tr>/;
        if (pattern.test(page)) {
            abst = trimTags(pattern.exec(page)[1]);
        }
    }
    if (abst) 
    {
        //                      Zotero.debug("abstract:\n"+abst);
        if (newItem.abstractNote === undefined) {
            newItem.abstractNote = Zotero.Utilities.trim(abst);
        }
        else {
            newItem.abstractNote = newItem.abstractNote + "\n" + trimMultiline(abst);
        }
    }
    //              Zotero.debug(newItem.abstractNote);
    // 关键词/Keywords
    var tags;
    pattern = /【关键词】\s*<span[^>]*>(.*?)<\/a>*<\/span>/;
    if (pattern.test(page)) {
        tags = trimTags(pattern.exec(page)[1]).split(";");
    }
    else 
    {
        pattern = /【关键词】([\s\S]*?)<\/tr>/;
        if (pattern.test(page)) {
            tags = trimTags(pattern.exec(page)[1]).split(";");
        }
    }
    if (tags) 
    {
        for (var i = 0; i < tags.length; i++) 
        {
            var tag = Zotero.Utilities.trim(tags[i]);
            if (tag.length > 0 && newItem.tags.indexOf(tag) < 0) {
                newItem.tags.push(tag);
            }
        }
        //                      Zotero.debug("tags:\n"+tags);
    }
    pattern = /【Key words】\s*<span[^>]*>(.*?)<\/a>*<\/span>/;
    if (pattern.test(page)) {
        tags = trimTags(pattern.exec(page)[1]).split(";");
    }
    else 
    {
        pattern = /【英文关键词】([\s\S]*?)<\/tr>/;
        if (pattern.test(page)) {
            tags = trimTags(pattern.exec(page)[1]).split(";");
        }
    }
    if (tags) 
    {
        for (var i = 0; i < tags.length; i++) 
        {
            var tag = Zotero.Utilities.trim(tags[i]);
            if (tag.length > 0 && newItem.tags.indexOf(tag) < 0) {
                newItem.tags.push(tag);
            }
        }
        //                      Zotero.debug("tags:\n"+tags);
    }
    //              Zotero.debug(newItem.tags);
    // 出版学校 & DOI & 出版时间
    var university;
    pattern = /【网络出版投稿人】\s*<a[^>]*>(.*?)<\/a>/;
    if (pattern.test(page)) {
        university = pattern.exec(page)[1];
    }
    else 
    {
        pattern = /【网络出版投稿人】([\s\S]*?)<\/tr>/;
        if (pattern.test(page)) {
            university = Zotero.Utilities.trim( trimTags(pattern.exec(page)[1]));
        }
    }
    if (university) 
    {
        pattern = /(.*?)（(.*?)）/;
        if (pattern.test(university)) 
        {
            newItem.university = pattern.exec(university)[1];
            newItem.place = pattern.exec(university)[2];
        }
        else {
            newItem.publisher = university;
        }
        //                      Zotero.debug("university: "+university);
    }
    var doi;
    pattern = /【DOI】(.*?)<\/li>/;
    if (pattern.test(page)) {
        doi = pattern.exec(page)[1];
    }
    else 
    {
        pattern = /【DOI】([\s\S]*?)<\/tr>/;
        if (pattern.test(page)) {
            var doi = trimTags(pattern.exec(page)[1]);
        }
    }
    if (doi) {
        newItem.DOI = Zotero.Utilities.trim(doi);
        //                      Zotero.debug("doi: "+doi);
    }
    var date;
    pattern = /【网络出版投稿时间】(.*?)\s*<\/li>/;
    if (pattern.test(page)) {
        date = pattern.exec(page)[1];
    }
    else 
    {
        pattern = /【网络出版投稿时间】([\s\S]*?)\s*<\/tr>/;
        if (pattern.test(page)) {
            date = trimTags(pattern.exec(page)[1]);
        }
    }
    if (date) {
        newItem.date = Zotero.Utilities.trim(date);
        //                      Zotero.debug("date: "+date);
    }
    newItem.complete();
}
// work for conferencePaper
function scrapeAndParse3(url, page) 
{
    //      Zotero.debug("conferencePaper");
    var pattern;
    // 类型 & URL
    var itemType = "conferencePaper";
    var newItem = new Zotero.Item(itemType);
    //              Zotero.debug(url);
    newItem.url = url;
    // 标题/Title
    pattern = /<span (?:id=["']chTitle["']|id=["']enTitle["']|class=["']datatitle["'])>(.*?)<\/span>/;
    if (pattern.test(page)) 
    {
        var title = trimTags(pattern.exec(page)[1]);
        newItem.title = title;
        //                      Zotero.debug("title: "+title);
    }
    // 作者/Authors
    pattern = /【作者】(.*?)<\/p>/;
    if (pattern.test(page)) 
    {
        var authorNames = trimTags(pattern.exec(page)[1]).split(";");
        for (var i = 0; i < authorNames.length; i++) 
        {
            newItem.creators.push( Zotero.Utilities.cleanAuthor( Zotero.Utilities.trim(authorNames[i]), 
            "author", true));
        }
        //                      Zotero.debug("authorNames:\n"+authorNames);
    }
    pattern = /【Author】(.*?)<\/p>/;
    if (pattern.test(page)) 
    {
        var authorNames = trimTags(pattern.exec(page)[1]).split(",");
        for (var i = 0; i < authorNames.length; i++) 
        {
            newItem.creators.push( Zotero.Utilities.cleanAuthor( Zotero.Utilities.trim(authorNames[i]), 
            "author", true));
        }
        //                      Zotero.debug("authorNames:\n"+authorNames);
    }

    // 摘要/Abstract
    var abst;
    pattern = /ReplaceFont\('ChDivSummary','(.*?)(?='\);ReplaceFont)/;
    if (pattern.test(page)) 
    {
        abst = pattern.exec(page)[1];
        //                      Zotero.debug("raw:\n"+abst);
        pattern = /(<.*?>)/g;
        abst = abst.replace(pattern, "");
        //                      Zotero.debug("after:\n"+abst);
        newItem.abstractNote = Zotero.Utilities.trim(abst);
    }
    pattern = /ReplaceFont\('EnDivSummary','(.*?)(?='\);if)/;
    if (pattern.test(page)) 
    {
        abst = pattern.exec(page)[1];
        //                      Zotero.debug("raw:\n"+abst);
        if (abst != undefined && abst != null) 
        {
            pattern = /(<.*?>)/g;
            abst = abst.replace(pattern, "");
            //                              Zotero.debug("after:\n"+abst);
            if (newItem.abstractNote === undefined) {
                newItem.abstractNote = Zotero.Utilities.trim(abst);
            }
            else {
                newItem.abstractNote = newItem.abstractNote + "\n" + Zotero.Utilities.trim(abst);
            }
        }
    }
    //              Zotero.debug("abst:\n"+newItem.abstractNote);
    // 关键词/Keywords
    pattern = /【关键词】\s*<span[^>]*>(.*?)<\/a>*<\/span>/;
    if (pattern.test(page)) 
    {
        var tags = trimTags(pattern.exec(page)[1]).split(";");
        for (var i = 0; i < tags.length; i++) 
        {
            var tag = Zotero.Utilities.trim(tags[i]);
            if (tag.length > 0 && newItem.tags.indexOf(tag) < 0) {
                newItem.tags.push(tag);
            }
        }
        //                      Zotero.debug("tags:\n"+tags);
    }
    pattern = /【Key words】\s*<span[^>]*>(.*?)<\/a>*<\/span>/;
    if (pattern.test(page)) 
    {
        var tags = trimTags(pattern.exec(page)[1]).split(";");
        for (var i = 0; i < tags.length; i++) 
        {
            var tag = Zotero.Utilities.trim(tags[i]);
            if (tag.length > 0 && newItem.tags.indexOf(tag) < 0) {
                newItem.tags.push(tag);
            }
        }
        //                      Zotero.debug("tags:\n"+tags);
    }
    //              Zotero.debug(newItem.tags);
    // 会议名称 & 会议录名称 & 会议地点 & 会议时间
    pattern = /【会议名称】(.*?)\s*<\/li>/;
    if (pattern.test(page)) 
    {
        var conferenceName = trimTags(pattern.exec(page)[1]);
        newItem.conferenceName = conferenceName;
        //                      Zotero.debug("conferenceName: "+conferenceName);
    }
    pattern = /【会议录名称】(.*?)\s*<\/li>/;
    if (pattern.test(page)) 
    {
        var proceedingsTitle = trimTags(pattern.exec(page)[1]);
        newItem.proceedingsTitle = proceedingsTitle;
        //                      Zotero.debug("proceedingsTitle: "+proceedingsTitle);
    }
    pattern = /【会议地点】(.*?)\s*<\/li>/;
    if (pattern.test(page)) 
    {
        var place = trimTags(pattern.exec(page)[1]);
        newItem.place = place;
        //                      Zotero.debug("place: "+place);
    }
    pattern = /【会议时间】(.*?)\s*<\/li>/;
    if (pattern.test(page)) 
    {
        var date = trimTags(pattern.exec(page)[1]);
        newItem.date = date;
        //                      Zotero.debug("date: "+date);
    }
    newItem.complete();
}
// work for newspaperArticle
function scrapeAndParse4(url, page) 
{
    //      Zotero.debug("newspaperArticle");
    var pattern;
    // 类型 & URL
    var itemType = "newspaperArticle";
    var newItem = new Zotero.Item(itemType);
    //              Zotero.debug(url);
    newItem.url = url;
    // 标题/Title
    pattern = /<span (?:id=["']chTitle["']|class=["']datatitle["'])>(.*?)<\/span>/;
    if (pattern.test(page)) 
    {
        var title = trimTags(pattern.exec(page)[1]);
        newItem.title = title;
        //                      Zotero.debug("title: "+title);
    }
    // 副标题/引题
    var shortTitle;
    pattern = /<p>【(?:副标题|引题)】(.*?)(?=<\/p>)/;
    if (pattern.test(page)) 
    {
        shortTitle = pattern.exec(page)[1];
        //                      Zotero.debug("shortTitle: "+shortTitle);
        newItem.shortTitle = Zotero.Utilities.trimInternal(shortTitle);
    }
    //              Zotero.debug(newItem.shortTitle);
    // 作者/Authors
    pattern = /【作\s*者】(.*?)<\/p>/;
    if (pattern.test(page)) 
    {
        var authorNames = trimTags(pattern.exec(page)[1]).split(";");
        for (var i = 0; i < authorNames.length; i++) 
        {
            newItem.creators.push( Zotero.Utilities.cleanAuthor( Zotero.Utilities.trim(authorNames[i]), 
            "author", true));
        }
        //                      Zotero.debug("authorNames:\n"+authorNames);
    }

    // 正文快照/Abstract
    var abst;
    pattern = /<p>【正文快照】(.*?)(?=<\/p>)/;
    if (pattern.test(page)) 
    {
        abst = pattern.exec(page)[1];
        //                      Zotero.debug("abst:\n"+abst);
        newItem.abstractNote = Zotero.Utilities.trimInternal(abst);
    }
    //              Zotero.debug(newItem.abstractNote);
    // 报纸名称 & DOI & 出版时间 & 版名 & 版号
    pattern = /【报纸名称】\s*<[^>]*>(.*?)<\/a>/;
    if (pattern.test(page)) 
    {
        var publicationTitle = trimTags(pattern.exec(page)[1]);
        newItem.publicationTitle = publicationTitle;
        //                      Zotero.debug("publicationTitle: "+publicationTitle);
    }
    pattern = /【DOI】\s*(.*?)\s*<\/li>/;
    if (pattern.test(page)) {
        var doi = pattern.exec(page)[1];
        newItem.DOI = doi;
        //                      Zotero.debug("doi: "+doi);
    }
    pattern = /【报纸日期】\s*(.*?)\s*<\/li>/;
    if (pattern.test(page)) {
        var date = pattern.exec(page)[1];
        newItem.date = date;
        //                      Zotero.debug("date: "+date);
    }
    pattern = /【版名】\s*(.*?)\s*<\/li>/;
    if (pattern.test(page)) 
    {
        var section = pattern.exec(page)[1];
        newItem.section = section;
        //                      Zotero.debug("section: "+section);
    }
    pattern = /【版号】\s*(.*?)\s*<\/li>/;
    if (pattern.test(page)) 
    {
        var edition = pattern.exec(page)[1];
        newItem.edition = edition;
        //                      Zotero.debug("edition: "+edition);
    }
    newItem.complete();
}
