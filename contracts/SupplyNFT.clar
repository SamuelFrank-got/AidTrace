;; SupplyNFT.clar - Sophisticated SIP-009 NFT for Humanitarian Supply Batches

;; Traits
(define-trait organization-registry-trait
  ((is-verified (principal) (response bool uint)))
)

;; Constants
(define-constant ERR-NOT-OWNER (err u100))
(define-constant ERR-TOKEN-NOT-FOUND (err u101))
(define-constant ERR-INVALID-URI (err u102))
(define-constant ERR-INVALID-METADATA (err u103))
(define-constant ERR-NOT-AUTHORIZED (err u104))
(define-constant ERR-ALREADY-MINTED (err u105))
(define-constant ERR-INVALID-QUANTITY (err u106))
(define-constant ERR-INVALID-EXPIRATION (err u107))
(define-constant ERR-TOKEN-LOCKED (err u108))
(define-constant ERR-INVALID-RECIPIENT (err u109))
(define-constant ERR-MAX-METADATA-LEN (err u110))
(define-constant ERR-INVALID-TAG (err u111))
(define-constant ERR-TOO-MANY-TAGS (err u112))
(define-constant ERR-NOT-VERIFIED (err u113))
(define-constant ERR-INVALID-VERSION (err u114))
(define-constant ERR-ALREADY-UPDATED (err u115))
(define-constant ERR-INVALID-STATUS (err u116))
(define-constant ERR-PAUSED (err u117))
(define-constant ERR-NOT-ADMIN (err u118))
(define-constant ERR-INVALID-DURATION (err u119))
(define-constant ERR-LICENSE-EXPIRED (err u120))
(define-constant MAX-METADATA-LEN u500)
(define-constant MAX-TAGS u10)
(define-constant MAX-VERSIONS u5)

;; Data Variables
(define-data-var contract-owner principal tx-sender)
(define-data-var last-token-id uint u0)
(define-data-var paused bool false)
(define-data-var registry-contract (optional principal) none)

;; Data Maps
(define-non-fungible-token supply-nft uint)

(define-map token-metadata uint {
  uri: (string-ascii 256),
  supply-type: (string-utf8 50),
  quantity: uint,
  expiration: (optional uint),
  description: (string-utf8 500),
  tags: (list 10 (string-utf8 20)),
  locked: bool
})

(define-map token-versions uint (list 5 {
  version: uint,
  updated-uri: (string-ascii 256),
  notes: (string-utf8 200),
  timestamp: uint
}))

(define-map token-status uint {
  status: (string-utf8 20),
  last-updated: uint
})

(define-map token-licenses uint (list 5 {
  licensee: principal,
  expiry: uint,
  terms: (string-utf8 200),
  active: bool
}))

(define-map collaborators uint (list 5 {
  collaborator: principal,
  role: (string-utf8 50),
  permissions: (list 5 (string-utf8 20)),
  added-at: uint
}))

;; Public Functions

(define-public (set-registry-contract (new-registry principal))
  (begin
    (asserts! (is-eq tx-sender (var-get contract-owner)) ERR-NOT-ADMIN)
    (var-set registry-contract (some new-registry))
    (ok true)
  )
)

(define-public (pause)
  (begin
    (asserts! (is-eq tx-sender (var-get contract-owner)) ERR-NOT-ADMIN)
    (var-set paused true)
    (ok true)
  )
)

(define-public (unpause)
  (begin
    (asserts! (is-eq tx-sender (var-get contract-owner)) ERR-NOT-ADMIN)
    (var-set paused false)
    (ok true)
  )
)

(define-public (mint (recipient principal) (uri (string-ascii 256)) (supply-type (string-utf8 50)) (quantity uint) (expiration (optional uint)) (description (string-utf8 500)) (tags (list 10 (string-utf8 20))))
  (let
    (
      (new-id (+ (var-get last-token-id) u1))
      (is-verified (try! (check-verified tx-sender)))
    )
    (asserts! (not (var-get paused)) ERR-PAUSED)
    (asserts! is-verified ERR-NOT-VERIFIED)
    (asserts! (> (len uri) u0) ERR-INVALID-URI)
    (asserts! (> quantity u0) ERR-INVALID-QUANTITY)
    (asserts! (<= (len description) MAX-METADATA-LEN) ERR-INVALID-METADATA)
    (asserts! (<= (len tags) MAX-TAGS) ERR-TOO-MANY-TAGS)
    (map-set token-metadata new-id {
      uri: uri,
      supply-type: supply-type,
      quantity: quantity,
      expiration: expiration,
      description: description,
      tags: tags,
      locked: false
    })
    (map-set token-status new-id {
      status: u"minted",
      last-updated: block-height
    })
    (var-set last-token-id new-id)
    (try! (nft-mint? supply-nft new-id recipient))
    (ok new-id)
  )
)

(define-public (transfer (token-id uint) (sender principal) (recipient principal))
  (begin
    (asserts! (not (var-get paused)) ERR-PAUSED)
    (asserts! (is-eq (unwrap! (nft-get-owner? supply-nft token-id) ERR-TOKEN-NOT-FOUND) sender) ERR-NOT-OWNER)
    (let ((metadata (unwrap! (map-get? token-metadata token-id) ERR-TOKEN-NOT-FOUND)))
      (asserts! (not (get locked metadata)) ERR-TOKEN-LOCKED)
    )
    (asserts! (not (is-eq recipient 'SP000000000000000000002Q6VF78)) ERR-INVALID-RECIPIENT)
    (try! (nft-transfer? supply-nft token-id sender recipient))
    (try! (update-status token-id u"transferred"))
    (ok true)
  )
)

(define-public (burn (token-id uint))
  (let
    (
      (owner (unwrap! (nft-get-owner? supply-nft token-id) ERR-TOKEN-NOT-FOUND))
    )
    (asserts! (not (var-get paused)) ERR-PAUSED)
    (asserts! (is-eq tx-sender owner) ERR-NOT-OWNER)
    (try! (nft-burn? supply-nft token-id owner))
    (map-delete token-metadata token-id)
    (map-delete token-versions token-id)
    (map-delete token-status token-id)
    (map-delete token-licenses token-id)
    (map-delete collaborators token-id)
    (ok true)
  )
)

(define-public (update-metadata (token-id uint) (new-uri (string-ascii 256)) (new-description (string-utf8 500)))
  (let
    (
      (owner (unwrap! (nft-get-owner? supply-nft token-id) ERR-TOKEN-NOT-FOUND))
      (current-metadata (unwrap! (map-get? token-metadata token-id) ERR-TOKEN-NOT-FOUND))
    )
    (asserts! (not (var-get paused)) ERR-PAUSED)
    (asserts! (is-eq tx-sender owner) ERR-NOT-OWNER)
    (asserts! (> (len new-uri) u0) ERR-INVALID-URI)
    (asserts! (<= (len new-description) MAX-METADATA-LEN) ERR-INVALID-METADATA)
    (map-set token-metadata token-id (merge current-metadata {uri: new-uri, description: new-description}))
    (try! (update-status token-id u"metadata-updated"))
    (ok true)
  )
)

(define-public (add-version (token-id uint) (version uint) (updated-uri (string-ascii 256)) (notes (string-utf8 200)))
  (let
    (
      (owner (unwrap! (nft-get-owner? supply-nft token-id) ERR-TOKEN-NOT-FOUND))
      (current-versions (default-to (list) (map-get? token-versions token-id)))
    )
    (asserts! (not (var-get paused)) ERR-PAUSED)
    (asserts! (is-eq tx-sender owner) ERR-NOT-OWNER)
    (asserts! (> version u0) ERR-INVALID-VERSION)
    (asserts! (< (len current-versions) MAX-VERSIONS) ERR-ALREADY-UPDATED)
    (asserts! (> (len updated-uri) u0) ERR-INVALID-URI)
    (map-set token-versions token-id (append current-versions {
      version: version,
      updated-uri: updated-uri,
      notes: notes,
      timestamp: block-height
    }))
    (try! (update-status token-id u"version-added"))
    (ok true)
  )
)

(define-public (grant-license (token-id uint) (licensee principal) (duration uint) (terms (string-utf8 200)))
  (let
    (
      (owner (unwrap! (nft-get-owner? supply-nft token-id) ERR-TOKEN-NOT-FOUND))
      (current-licenses (default-to (list) (map-get? token-licenses token-id)))
    )
    (asserts! (not (var-get paused)) ERR-PAUSED)
    (asserts! (is-eq tx-sender owner) ERR-NOT-OWNER)
    (asserts! (> duration u0) ERR-INVALID-DURATION)
    (map-set token-licenses token-id (append current-licenses {
      licensee: licensee,
      expiry: (+ block-height duration),
      terms: terms,
      active: true
    }))
    (try! (update-status token-id u"license-granted"))
    (ok true)
  )
)

(define-public (revoke-license (token-id uint) (licensee principal))
  (let
    (
      (owner (unwrap! (nft-get-owner? supply-nft token-id) ERR-TOKEN-NOT-FOUND))
      (current-licenses (default-to (list) (map-get? token-licenses token-id)))
    )
    (asserts! (not (var-get paused)) ERR-PAUSED)
    (asserts! (is-eq tx-sender owner) ERR-NOT-OWNER)
    (map-set token-licenses token-id
      (filter (lambda ((lic {licensee: principal, expiry: uint, terms: (string-utf8 200), active: bool}))
        (not (is-eq (get licensee lic) licensee))
      ) current-licenses)
    )
    (try! (update-status token-id u"license-revoked"))
    (ok true)
  )
)

(define-public (add-collaborator (token-id uint) (collaborator principal) (role (string-utf8 50)) (permissions (list 5 (string-utf8 20))))
  (let
    (
      (owner (unwrap! (nft-get-owner? supply-nft token-id) ERR-TOKEN-NOT-FOUND))
      (current-collabs (default-to (list) (map-get? collaborators token-id)))
    )
    (asserts! (not (var-get paused)) ERR-PAUSED)
    (asserts! (is-eq tx-sender owner) ERR-NOT-OWNER)
    (map-set collaborators token-id (append current-collabs {
      collaborator: collaborator,
      role: role,
      permissions: permissions,
      added-at: block-height
    }))
    (try! (update-status token-id u"collaborator-added"))
    (ok true)
  )
)

(define-public (lock-token (token-id uint))
  (let
    (
      (owner (unwrap! (nft-get-owner? supply-nft token-id) ERR-TOKEN-NOT-FOUND))
      (metadata (unwrap! (map-get? token-metadata token-id) ERR-TOKEN-NOT-FOUND))
    )
    (asserts! (not (var-get paused)) ERR-PAUSED)
    (asserts! (is-eq tx-sender owner) ERR-NOT-OWNER)
    (asserts! (not (get locked metadata)) ERR-TOKEN-LOCKED)
    (map-set token-metadata token-id (merge metadata {locked: true}))
    (try! (update-status token-id u"locked"))
    (ok true)
  )
)

(define-public (unlock-token (token-id uint))
  (let
    (
      (owner (unwrap! (nft-get-owner? supply-nft token-id) ERR-TOKEN-NOT-FOUND))
      (metadata (unwrap! (map-get? token-metadata token-id) ERR-TOKEN-NOT-FOUND))
    )
    (asserts! (not (var-get paused)) ERR-PAUSED)
    (asserts! (is-eq tx-sender owner) ERR-NOT-OWNER)
    (asserts! (get locked metadata) ERR-TOKEN-LOCKED)
    (map-set token-metadata token-id (merge metadata {locked: false}))
    (try! (update-status token-id u"unlocked"))
    (ok true)
  )
)

;; Private Functions
(define-private (update-status (token-id uint) (new-status (string-utf8 20)))
  (begin
    (asserts! (> (len new-status) u0) ERR-INVALID-STATUS)
    (map-set token-status token-id {
      status: new-status,
      last-updated: block-height
    })
    (ok true)
  )
)

(define-private (check-verified (actor principal))
  (match (var-get registry-contract)
    some-registry (contract-call? some-registry is-verified actor)
    (ok false)
  )
)

;; Read-Only Functions
(define-read-only (get-last-token-id)
  (ok (var-get last-token-id))
)

(define-read-only (get-token-uri (token-id uint))
  (ok (get uri (map-get? token-metadata token-id)))
)

(define-read-only (get-owner (token-id uint))
  (ok (nft-get-owner? supply-nft token-id))
)

(define-read-only (get-metadata (token-id uint))
  (map-get? token-metadata token-id)
)

(define-read-only (get-versions (token-id uint))
  (map-get? token-versions token-id)
)

(define-read-only (get-status (token-id uint))
  (map-get? token-status token-id)
)

(define-read-only (get-licenses (token-id uint))
  (map-get? token-licenses token-id)
)

(define-read-only (get-collaborators (token-id uint))
  (map-get? collaborators token-id)
)

(define-read-only (is-locked (token-id uint))
  (ok (get locked (default-to {locked: false} (map-get? token-metadata token-id))))
)

(define-read-only (is-license-active (token-id uint) (licensee principal))
  (let ((licenses (default-to (list) (map-get? token-licenses token-id))))
    (ok (fold (lambda ((lic {licensee: principal, expiry: uint, terms: (string-utf8 200), active: bool}) (acc bool))
      (or acc (and (is-eq (get licensee lic) licensee) (get active lic) (>= (get expiry lic) block-height)))
    ) licenses false))
  )
)

(define-read-only (is-paused)
  (ok (var-get paused))
)

(define-read-only (get-contract-owner)
  (ok (var-get contract-owner))
)