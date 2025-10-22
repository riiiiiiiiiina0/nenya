# Highlights | API Documentation

**URL:** https://developer.raindrop.io/v1/highlights

**Extracted:** 2025-10-21T01:27:29.203Z

---

<content>
Single `highlight` object:

Field

Type

Description

\_id

`String`

Unique id of highlight

text

`String`

Text of highlight (required)

title

`String`

Title of bookmark

color

`String`

Color of highlight. Default `yellow` Can be `blue`, `brown`, `cyan`, `gray`, `green`, `indigo`, `orange`, `pink`, `purple`, `red`, `teal`, `yellow`

note

`String`

Optional note for highlight

created

`String`

Creation date of highlight

tags

`Array`

Tags list

link

`String`

Highlighted page URL

## 

[](#get-all-highlights)

Get all highlights

`GET` `https://api.raindrop.io/rest/v1/highlights`

#### 

[](#query-parameters)

Query Parameters

Name

Type

Description

page

Number

perpage

Number

How many highlights per page. 50 max. Default 25

200: OK

Copy

```
{
    "result": true,
    "items": [
        {
            "note": "Trully native macOS app",
            "color": "red",
            "text": "Orion is the new WebKit-based browser for Mac",
            "created": "2022-03-21T14:41:34.059Z",
            "tags": ["tag1", "tag2"],
            "_id": "62388e9e48b63606f41e44a6",
            "raindropRef": 123,
            "link": "https://apple.com",
            "title": "Orion Browser"
        },
        {
            "note": "",
            "color": "green",
            "text": "Built on WebKit, Orion gives you a fast, smooth and lightweight browsing experience",
            "created": "2022-03-21T15:13:21.128Z",
            "tags": ["tag1", "tag2"],
            "_id": "62389611058af151c840f667",
            "raindropRef": 123,
            "link": "https://apple.com",
            "title": "Apple"
        }
    ]
}
```

## 

[](#get-all-highlights-in-a-collection)

Get all highlights in a collection

`GET` `https://api.raindrop.io/rest/v1/highlights/{collectionId}`

#### 

[](#path-parameters)

Path Parameters

Name

Type

Description

collectionId\*

Number

Collection ID

page

Number

perpage

Number

How many highlights per page. 50 max. Default 25

200: OK

Copy

```
{
    "result": true,
    "items": [
        {
            "note": "Trully native macOS app",
            "color": "red",
            "text": "Orion is the new WebKit-based browser for Mac",
            "created": "2022-03-21T14:41:34.059Z",
            "tags": ["tag1", "tag2"],
            "_id": "62388e9e48b63606f41e44a6",
            "raindropRef": 123,
            "link": "https://apple.com",
            "title": "Apple"
        },
        {
            "note": "",
            "color": "green",
            "text": "Built on WebKit, Orion gives you a fast, smooth and lightweight browsing experience",
            "created": "2022-03-21T15:13:21.128Z",
            "tags": ["tag1", "tag2"],
            "_id": "62389611058af151c840f667",
            "raindropRef": 123,
            "link": "https://apple.com",
            "title": "Apple"
        }
    ]
}
```

## 

[](#get-highlights-of-raindrop)

Get highlights of raindrop

`GET` `https://api.raindrop.io/rest/v1/raindrop/{id}`

#### 

[](#path-parameters-1)

Path Parameters

Name

Type

Description

id\*

number

Existing raindrop ID

200

Copy

```
{
    "result": true,
    "item": {
        "_id": 373777232,
        "highlights": [
            {
                "note": "Trully native macOS app",
                "color": "red",
                "text": "Orion is the new WebKit-based browser for Mac",
                "created": "2022-03-21T14:41:34.059Z",
                "lastUpdate": "2022-03-22T14:30:52.004Z",
                "_id": "62388e9e48b63606f41e44a6"
            },
            {
                "note": "",
                "color": "green",
                "text": "Built on WebKit, Orion gives you a fast, smooth and lightweight browsing experience",
                "created": "2022-03-21T15:13:21.128Z",
                "lastUpdate": "2022-03-22T09:15:18.751Z",
                "_id": "62389611058af151c840f667"
            }
        ]
    }
}
```

## 

[](#add-highlight)

Add highlight

`PUT` `https://api.raindrop.io/rest/v1/raindrop/{id}`

Just specify a `highlights` array in body with `object` for each highlight

**Fore example:**

`{"highlights": [ { "text": "Some quote", "color": "red", "note": "Some note" } ] }`

#### 

[](#path-parameters-2)

Path Parameters

Name

Type

Description

id\*

number

Existing raindrop ID

#### 

[](#request-body)

Request Body

Name

Type

Description

highlights\*

array

highlights\[\].text\*

String

highlights\[\].note

String

highlights\[\].color

String

200

Copy

```
{
    "result": true,
    "item": {
        "_id": 373777232,
        "highlights": [
            {
                "note": "Trully native macOS app",
                "color": "red",
                "text": "Orion is the new WebKit-based browser for Mac",
                "created": "2022-03-21T14:41:34.059Z",
                "lastUpdate": "2022-03-22T14:30:52.004Z",
                "_id": "62388e9e48b63606f41e44a6"
            },
            {
                "note": "",
                "color": "green",
                "text": "Built on WebKit, Orion gives you a fast, smooth and lightweight browsing experience",
                "created": "2022-03-21T15:13:21.128Z",
                "lastUpdate": "2022-03-22T09:15:18.751Z",
                "_id": "62389611058af151c840f667"
            }
        ]
    }
}
```

## 

[](#update-highlight)

Update highlight

`PUT` `https://api.raindrop.io/rest/v1/raindrop/{id}`

Just specify a `highlights` array in body with `object` containing particular `_id` of highlight you want to update and all other fields you want to change.

**Fore example:**

`{"highlights": [ { "_id": "62388e9e48b63606f41e44a6", "note": "New note" } ] }`

#### 

[](#path-parameters-3)

Path Parameters

Name

Type

Description

id\*

number

Existing raindrop ID

#### 

[](#request-body-1)

Request Body

Name

Type

Description

highlights\*

array

highlights\[\].\_id\*

String

Particular highlight \_id you want to remove

highlights\[\].text

String

Should be empty string

highlights\[\].note

String

highlights\[\].color

String

200

Copy

```
{
    "result": true,
    "item": {
        "_id": 373777232,
        "highlights": [
            {
                "note": "Trully native macOS app",
                "color": "red",
                "text": "Orion is the new WebKit-based browser for Mac",
                "created": "2022-03-21T14:41:34.059Z",
                "lastUpdate": "2022-03-22T14:30:52.004Z",
                "_id": "62388e9e48b63606f41e44a6"
            },
            {
                "note": "",
                "color": "green",
                "text": "Built on WebKit, Orion gives you a fast, smooth and lightweight browsing experience",
                "created": "2022-03-21T15:13:21.128Z",
                "lastUpdate": "2022-03-22T09:15:18.751Z",
                "_id": "62389611058af151c840f667"
            }
        ]    }}
```

## 

[](#remove-highlight)

Remove highlight

`PUT` `https://api.raindrop.io/rest/v1/raindrop/{id}`

Just specify a `highlights` array in body with `object` containing particular `_id` of highlight you want to remove and empty string for `text` field.

**Fore example:**

`{"highlights": [ { "_id": "62388e9e48b63606f41e44a6", "text": "" } ] }`

#### 

[](#path-parameters-4)

Path Parameters

Name

Type

Description

id\*

number

Existing raindrop ID

#### 

[](#request-body-2)

Request Body

Name

Type

Description

highlights\*

array

highlights\[\].\_id\*

String

Particular highlight \_id you want to remove

highlights\[\].text\*

String

Should be empty string

200

Copy

```
{
    "result": true,
    "item": {
        "_id": 373777232,
        "highlights": [
            {
                "note": "Trully native macOS app",
                "color": "red",
                "text": "Orion is the new WebKit-based browser for Mac",
                "created": "2022-03-21T14:41:34.059Z",
                "lastUpdate": "2022-03-22T14:30:52.004Z",
                "_id": "62388e9e48b63606f41e44a6"
            },
            {
                "note": "",
                "color": "green",
                "text": "Built on WebKit, Orion gives you a fast, smooth and lightweight browsing experience",
                "created": "2022-03-21T15:13:21.128Z",
                "lastUpdate": "2022-03-22T09:15:18.751Z",
                "_id": "62389611058af151c840f667"
            }
        ]
    }}
```

[PreviousMultiple raindrops](/v1/raindrops/multiple)[NextUser](/v1/user)

Last updated 3 years ago

Was this helpful?
</content>