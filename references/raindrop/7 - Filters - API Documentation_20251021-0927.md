# Filters | API Documentation

**URL:** https://developer.raindrop.io/v1/filters

**Extracted:** 2025-10-21T01:27:40.985Z

---

<content>
To help users easily find their content you can suggest context aware filters like we have in Raindrop.io app

Filters right above search field

## 

[](#fields)

Fields

Field

Type

Description

broken

`Object`

broken.count

`Integer`

Broken links count

duplicates

`Object`

duplicates.count

`Integer`

Duplicate links count

important

`Object`

important.count

`Integer`

Count of raindrops that marked as "favorite"

notag

`Object`

notag.count

`Integer`

Count of raindrops without any tag

tags

`Array<Object>`

List of tags in format `{"_id": "tag name", "count": 1}`

types

`Array<Object>`

List of types in format `{"_id": "type", "count": 1}`

## 

[](#get-filters)

Get filters

`GET` `https://api.raindrop.io/rest/v1/filters/{collectionId}`

#### 

[](#path-parameters)

Path Parameters

Name

Type

Description

collectionId

string

Collection ID. `0` for all

#### 

[](#query-parameters)

Query Parameters

Name

Type

Description

tagsSort

string

Sort tags by: `**-count**` by count, default `**_id**` by name

search

string

Check "raindrops" documentation for more details

200

Copy

```
{
  "result": true,
  "broken": {
    "count": 31
  },
  "duplicates": {
    "count": 7
  },
  "important": {
    "count": 59
  },
  "notag": {
    "count": 1366
  },
  "tags": [
    {
      "_id": "performanc",
      "count": 19
    },
    {
      "_id": "guides",
      "count": 9
    }
  ],
  "types": [
    {
      "_id": "article",
      "count": 313
    },
    {
      "_id": "image",
      "count": 143
    },
    {
      "_id": "video",
      "count": 26
    },
    {
      "_id": "document",
      "count": 7
    }
  ]
}
```

[PreviousTags](/v1/tags)[NextImport](/v1/import)

Last updated 10 months ago

Was this helpful?
</content>