# Tags | API Documentation

**URL:** https://developer.raindrop.io/v1/tags

**Extracted:** 2025-10-21T01:27:19.305Z

---

<content>
## 

[](#get-tags)

Get tags

`GET` `https://api.raindrop.io/rest/v1/tags/{collectionId}`

#### 

[](#path-parameters)

Path Parameters

Name

Type

Description

collectionId

number

Optional collection ID, when not specified all tags from all collections will be retrieved

200

Copy

```
{
    "result": true,
    "items": [
        {
            "_id": "api",
            "count": 100
        }
    ]
}
```

## 

[](#rename-tag)

Rename tag

`PUT` `https://api.raindrop.io/rest/v1/tags/{collectionId}`

#### 

[](#path-parameters-1)

Path Parameters

Name

Type

Description

collectionId

number

It's possible to restrict rename action to just one collection. It's optional

#### 

[](#request-body)

Request Body

Name

Type

Description

replace

string

New name

tags

array

Specify **array** with **only one** string (name of a tag)

200

Copy

```
{
    "result": true
}
```

## 

[](#merge-tags)

Merge tags

`PUT` `https://api.raindrop.io/rest/v1/tags/{collectionId}`

Basically this action rename bunch of `tags` to new name (`replace` field)

#### 

[](#path-parameters-2)

Path Parameters

Name

Type

Description

collectionId

string

It's possible to restrict merge action to just one collection. It's optional

#### 

[](#request-body-1)

Request Body

Name

Type

Description

replace

string

New name

tags

array

List of tags

200

Copy

```
{
    "result": true
}
```

## 

[](#remove-tag-s)

Remove tag(s)

`DELETE` `https://api.raindrop.io/rest/v1/tags/{collectionId}`

#### 

[](#path-parameters-3)

Path Parameters

Name

Type

Description

collectionId

string

It's possible to restrict remove action to just one collection. It's optional

#### 

[](#request-body-2)

Request Body

Name

Type

Description

tags

array

List of tags

200

Copy

```
{
    "result": true
}
```

[PreviousAuthenticated user](/v1/user/authenticated)[NextFilters](/v1/filters)

Last updated 2 years ago

Was this helpful?
</content>