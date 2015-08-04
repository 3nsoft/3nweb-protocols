# 3NWeb protocols and demo implementation of the specs

**3NWeb** is a set of protocols that meticulously implement [Principle of Least Authority (POLA)](https://en.wikipedia.org/wiki/Principle_of_least_privilege) in services with client+server architecture.
For such architectures POLA is articulated into the following prescriptive form:
 - with <b>No plain text</b> on a server
 - with <b>No unnecessary metadata</b> on a server
 - there is <b>Nothing to steal</b> from the server

ASMail protocol is for mail and, more generally, for asynchronous messaging.  
Among other things, ASMail protocol features anonimity of sender to server with simultaneous strong authentication to recipient.

3NStorage protocol is for remote storage and file sharing, private (anonymous) and secure.

MailerId protocol provides non-tracking identity service.
It is directly used by ASMail and 3NStorage protocols.
And MailerId can also be used by other services/sites in place of identity trackable protocols, like [OpenID](https://en.wikipedia.org/wiki/OpenID).

Public Key Login (PKL) protocol provides authentication based on public keys.
This protocol, in particular, is used in MailerId for a sensitive provisioning phase.
And PKL can be used everywhere instead of passwords, as MitM on password-carrying HTTPS channel immediately discloses password to an attacker, while with PKL such attack turns into an offline attack on password, if key is derived from a password.  
PKL can be setup with secondary authentication factor(s) in addition to a key, whether it is derived from a password, or not.

All protocols are formulated to use high-level cryptographic functionality.
And are using [NaCl](http://nacl.cr.yp.to/) library, that provides such high-level functionality.

## Demo implementation of protocol specs


## Authenticated Secure Mail (ASMail)


## 3NStorage


## MailerId


## Public Key Login (PKL)


## License

Specification of all protocols, formulated here, is freely available for anyone to implement and use on both server and client side.

Demo *implementation* of 3NWeb protocols, i.e. code in this repository, is covered by GPL-3.0.
